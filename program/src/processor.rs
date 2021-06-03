use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    system_instruction::create_account,
    sysvar::{rent::Rent, Sysvar},
};

use spl_token::state::{Account, Mint};

use crate::{
    account::{Beneficiary, Community, Settings, Stake, StakePayout},
    calculate_payout,
    error::StakingError,
    instruction::StakingInstruction,
    MINIMUM_STAKE, ZERO_KEY,
};

pub struct Processor {}
impl Processor {
    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = StakingInstruction::try_from_slice(input)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        msg!("Staking Instruction :: {:?}", instruction);

        match instruction {
            StakingInstruction::Initialize { sponsor_fee } => {
                Self::process_initialize(program_id, accounts, sponsor_fee)
            }
            StakingInstruction::RegisterCommunity => {
                Self::process_register_community(program_id, accounts)
            }
            StakingInstruction::InitializeStake => {
                Self::process_initialize_stake(program_id, accounts)
            }
            StakingInstruction::Stake { amount } => {
                Self::process_stake(program_id, accounts, amount)
            }
            StakingInstruction::Unstake { amount } => {
                Self::process_stake(program_id, accounts, amount)
            }
            StakingInstruction::WithdrawUnbond => {
                Self::process_withdraw_unbond(program_id, accounts)
            }
        }
    }

    pub fn process_initialize(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        sponsor_fee: u64,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let authority_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let pool_info = next_account_info(iter)?;
        let token_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let token_program_info = next_account_info(iter)?;
        let program_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;

        if !authority_info.is_signer {
            return Err(StakingError::MissingAuthoritySignature.into());
        }

        if settings_info.data_len() > 0 {
            return Err(StakingError::ProgramAlreadyInitialized.into());
        }

        let seed = Settings::verify_program_address(settings_info.key, program_id)?;
        Mint::unpack(&token_info.data.borrow()).map_err(|_| StakingError::TokenNotSPLToken)?;

        let pool_seed = Settings::verify_pool_address(pool_info.key, program_id)?;

        let settings = Settings {
            sponsor_fee,
            authority: *authority_info.key,
            token: *token_info.key,
            total_stake: 0,
        };

        let data = settings.try_to_vec()?;

        let space = data.len();
        let lamports = rent.minimum_balance(space);

        invoke_signed(
            &create_account(
                funder_info.key,
                settings_info.key,
                lamports,
                space as u64,
                program_id,
            ),
            &[funder_info.clone(), settings_info.clone()],
            &[&[b"settings", &[seed]]],
        )?;

        settings_info.data.borrow_mut().copy_from_slice(&data);

        let lamports = rent.minimum_balance(Account::LEN);
        let space = Account::LEN as u64;
        invoke_signed(
            &create_account(
                funder_info.key,
                pool_info.key,
                lamports,
                space,
                &spl_token::id(),
            ),
            &[funder_info.clone(), pool_info.clone()],
            &[&[b"pool", &[pool_seed]]],
        )?;

        invoke(
            &spl_token::instruction::initialize_account(
                &spl_token::id(),
                pool_info.key,
                token_info.key,
                program_id,
            )?,
            &[
                pool_info.clone(),
                token_info.clone(),
                rent_info.clone(),
                program_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        Ok(())
    }
    pub fn process_register_community(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let creator_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let primary_info = next_account_info(iter)?;
        let primary_associated_info = next_account_info(iter)?;
        let secondary_info = next_account_info(iter)?;
        let secondary_associated_info = next_account_info(iter)?;
        let referrer_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        if !creator_info.is_signer {
            return Err(StakingError::CommunityCreatorSignatureMissing.into());
        }

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;

        let settings = Settings::from_account_info(settings_info, program_id)?;

        if !community_info.data_is_empty() {
            return Err(StakingError::CommunityAccountAlreadyExists.into());
        }

        let primary_assoc = Account::unpack(&primary_associated_info.data.borrow())
            .map_err(|_| StakingError::PrimaryAssociatedInvalidAccount)?;
        if primary_assoc.mint != settings.token {
            return Err(StakingError::PrimaryAssociatedInvalidToken.into());
        }
        if primary_assoc.owner != *primary_info.key {
            return Err(StakingError::PrimaryAssociatedInvalidOwner.into());
        }

        let primary = Beneficiary {
            staked: 0,
            authority: *primary_info.key,
            address: *primary_associated_info.key,
            unclaimed: StakePayout::new(0),
        };

        let secondary = if *secondary_info.key != ZERO_KEY {
            let secondary_assoc = Account::unpack(&secondary_associated_info.data.borrow())
                .map_err(|_| StakingError::SecondaryAssociatedInvalidAccount)?;
            if secondary_assoc.mint != settings.token {
                return Err(StakingError::SecondaryAssociatedInvalidToken.into());
            }
            if secondary_assoc.owner != *secondary_info.key {
                return Err(StakingError::SecondaryAssociatedInvalidOwner.into());
            }

            Beneficiary {
                staked: 0,
                authority: *secondary_info.key,
                address: *secondary_associated_info.key,
                unclaimed: StakePayout::new(0),
            }
        } else {
            msg!("No secondary account, enabling sponsor");
            Beneficiary {
                staked: 0,
                authority: ZERO_KEY,
                address: ZERO_KEY,
                unclaimed: StakePayout::new(0),
            }
        };

        let community = Community {
            creation_date: clock.unix_timestamp,
            last_action: clock.unix_timestamp,
            authority: *creator_info.key,
            primary,
            secondary,
            referrer: *referrer_info.key,
        };

        let data = community.try_to_vec()?;

        let lamports = rent.minimum_balance(data.len());
        let space = data.len() as u64;

        msg!("Registering Community: {:?}", community);
        invoke(
            &create_account(
                funder_info.key,
                community_info.key,
                lamports,
                space,
                program_id,
            ),
            &[funder_info.clone(), community_info.clone()],
        )?;

        community_info.data.borrow_mut().copy_from_slice(&data);

        Ok(())
    }

    pub fn process_initialize_stake(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;
        let settings = Settings::from_account_info(settings_info, program_id)?;
        let _ = Community::from_account_info(community_info, program_id)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let staker_assoc = Account::unpack(&staker_associated_info.data.borrow())
            .map_err(|_| StakingError::StakerAssociatedInvalidAccount)?;
        if staker_assoc.mint != settings.token {
            return Err(StakingError::StakerAssociatedInvalidToken.into());
        }
        if staker_assoc.owner != *staker_info.key {
            return Err(StakingError::StakerAssociatedInvalidOwner.into());
        }

        let seed = Stake::verify_program_address(
            stake_info.key,
            community_info.key,
            staker_info.key,
            program_id,
        )?;

        let stake = Stake {
            creation_date: clock.unix_timestamp,
            total_stake: 0,
            self_stake: 0,
            primary_stake: 0,
            secondary_stake: 0,
            last_action: clock.unix_timestamp,
            unclaimed: StakePayout::new(0),
            unbonding_start: clock.unix_timestamp,
            unbonding_amount: 0,
        };

        let data = stake.try_to_vec()?;

        let lamports = rent.minimum_balance(data.len());
        let space = data.len() as u64;

        invoke_signed(
            &create_account(
                funder_info.key,
                stake_info.key,
                lamports,
                space as u64,
                program_id,
            ),
            &[funder_info.clone(), stake_info.clone()],
            &[&[
                b"stake",
                &community_info.key.to_bytes(),
                &staker_info.key.to_bytes(),
                &[seed],
            ]],
        )
    }

    pub fn process_stake(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let mut settings = Settings::from_account_info(settings_info, program_id)?;
        let mut community = Community::from_account_info(community_info, program_id)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let staker_assoc = Account::unpack(&staker_associated_info.data.borrow())
            .map_err(|_| StakingError::StakerAssociatedInvalidAccount)?;
        if staker_assoc.mint != settings.token {
            return Err(StakingError::StakerAssociatedInvalidToken.into());
        }
        if staker_assoc.owner != *staker_info.key {
            return Err(StakingError::StakerAssociatedInvalidOwner.into());
        }
        if staker_assoc.amount < amount {
            return Err(StakingError::StakerBalanceTooLow.into());
        }

        Stake::verify_program_address(
            stake_info.key,
            community_info.key,
            staker_info.key,
            program_id,
        )?;

        // update settings
        settings.total_stake += amount;

        // update staker
        let mut stake = Stake::try_from_slice(&stake_info.data.borrow())?;
        if stake.total_stake + amount < MINIMUM_STAKE {
            return Err(StakingError::StakerMinimumBalanceNotMet.into());
        }

        let staker_payout =
            calculate_payout(stake.last_action, clock.unix_timestamp, stake.self_stake);
        stake.unclaimed.add(staker_payout);
        stake.last_action = clock.unix_timestamp;

        let (d_primary, d_secondary) = stake.add_stake(amount);

        // update primary + secondary
        community.update_payout(clock.unix_timestamp);
        community.primary.staked += d_primary;
        community.secondary.staked += d_secondary;

        settings_info
            .data
            .borrow_mut()
            .copy_from_slice(&settings.try_to_vec()?);
        stake_info
            .data
            .borrow_mut()
            .copy_from_slice(&stake.try_to_vec()?);
        community_info
            .data
            .borrow_mut()
            .copy_from_slice(&community.try_to_vec()?);

        Ok(())
    }

    pub fn process_unstake(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let mut settings = Settings::from_account_info(settings_info, program_id)?;
        let mut community = Community::from_account_info(community_info, program_id)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let staker_assoc = Account::unpack(&staker_associated_info.data.borrow())
            .map_err(|_| StakingError::StakerAssociatedInvalidAccount)?;
        if staker_assoc.mint != settings.token {
            return Err(StakingError::StakerAssociatedInvalidToken.into());
        }
        if staker_assoc.owner != *staker_info.key {
            return Err(StakingError::StakerAssociatedInvalidOwner.into());
        }

        Stake::verify_program_address(
            stake_info.key,
            community_info.key,
            staker_info.key,
            program_id,
        )?;

        // update staker
        let mut stake = Stake::try_from_slice(&stake_info.data.borrow())?;

        if amount > stake.total_stake {
            return Err(StakingError::StakerWithdrawingTooMuch.into());
        }

        // allow them to withdraw everything
        if stake.total_stake - amount > 0 && stake.total_stake - amount < MINIMUM_STAKE {
            return Err(StakingError::StakerMinimumBalanceNotMet.into());
        }

        // update settings
        settings.total_stake -= amount;

        let staker_payout =
            calculate_payout(stake.last_action, clock.unix_timestamp, stake.self_stake);
        stake.unclaimed.add(staker_payout);
        stake.last_action = clock.unix_timestamp;

        // move payout to unbond
        stake.unbonding_start = clock.unix_timestamp;
        stake.unbonding_amount += stake.unclaimed.whole();
        stake.unclaimed.clear_whole();

        let (d_primary, d_secondary) = stake.remove_stake(amount);

        // update primary + secondary
        community.update_payout(clock.unix_timestamp);
        community.primary.staked -= d_primary;
        community.secondary.staked -= d_secondary;

        settings_info
            .data
            .borrow_mut()
            .copy_from_slice(&settings.try_to_vec()?);
        stake_info
            .data
            .borrow_mut()
            .copy_from_slice(&stake.try_to_vec()?);
        community_info
            .data
            .borrow_mut()
            .copy_from_slice(&community.try_to_vec()?);

        Ok(())
    }

    pub fn process_withdraw_unbond(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let pool_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let settings = Settings::from_account_info(settings_info, program_id)?;
        // not verifying community, we just need an existing pubkey to check stake program address
        let pool_seed = Settings::verify_pool_address(pool_info.key, program_id)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let staker_assoc = Account::unpack(&staker_associated_info.data.borrow())
            .map_err(|_| StakingError::StakerAssociatedInvalidAccount)?;
        if staker_assoc.mint != settings.token {
            return Err(StakingError::StakerAssociatedInvalidToken.into());
        }
        if staker_assoc.owner != *staker_info.key {
            return Err(StakingError::StakerAssociatedInvalidOwner.into());
        }

        Stake::verify_program_address(
            stake_info.key,
            community_info.key,
            staker_info.key,
            program_id,
        )?;

        let mut stake = Stake::try_from_slice(&stake_info.data.borrow())?;
        if stake.unbonding_amount == 0 {
            return Err(StakingError::WithdrawNothingtowithdraw.into());
        }

        if clock.unix_timestamp - stake.unbonding_start < crate::UNBONDING_PERIOD {
            return Err(StakingError::WithdrawUnbondingTimeNotOverYet.into());
        }

        invoke_signed(
            &spl_token::instruction::transfer(
                &spl_token::id(),
                pool_info.key,
                staker_associated_info.key,
                program_id,
                &[],
                stake.unbonding_amount,
            )?,
            &[staker_associated_info.clone(), pool_info.clone()],
            &[&[b"pool", &[pool_seed]]],
        )?;

        stake.unbonding_amount = 0;
        stake.unbonding_start = clock.unix_timestamp;

        stake_info
            .data
            .borrow_mut()
            .copy_from_slice(&stake.try_to_vec()?);

        Ok(())
    }
}
