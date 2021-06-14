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
    account::{
        Beneficiary, BorshU256, Community, PoolAuthority, RewardPool, Settings, Stake, StakePool,
    },
    error::StakingError,
    instruction::StakingInstruction,
    pool_transfer, split_stake, verify_associated, MINIMUM_STAKE, ZERO_KEY,
};

pub struct Processor {}
impl Processor {
    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = StakingInstruction::try_from_slice(input)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        msg!("Staking Instruction :: {:?}", instruction);

        match instruction {
            StakingInstruction::Initialize => Self::process_initialize(program_id, accounts),
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
                Self::process_unstake(program_id, accounts, amount)
            }
            StakingInstruction::WithdrawUnbond => {
                Self::process_withdraw_unbond(program_id, accounts)
            }
            StakingInstruction::ClaimPrimary => Self::process_claim(program_id, accounts, true),
            StakingInstruction::ClaimSecondary => Self::process_claim(program_id, accounts, false),
        }
    }

    pub fn process_initialize(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let authority_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let pool_authority_info = next_account_info(iter)?;
        let stake_pool_info = next_account_info(iter)?;
        let reward_pool_info = next_account_info(iter)?;
        let token_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;
        let token_program_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;

        if !authority_info.is_signer {
            return Err(StakingError::MissingAuthoritySignature.into());
        }

        if settings_info.data_len() > 0 {
            return Err(StakingError::ProgramAlreadyInitialized.into());
        }

        let seed = Settings::verify_program_address(settings_info.key, program_id)?;
        Mint::unpack(&token_info.data.borrow()).map_err(|_| StakingError::TokenNotSPLToken)?;

        let settings = Settings {
            authority: *authority_info.key,
            token: *token_info.key,
            reward_per_share: BorshU256::from(0),
            last_reward: clock.unix_timestamp,
            total_stake: 0,
        };

        msg!("Settings: {:?}", settings);

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

        msg!("Settings account created");

        // create stake pool
        let stake_pool_seed = StakePool::verify_program_address(stake_pool_info.key, program_id)?;

        let lamports = rent.minimum_balance(Account::LEN);
        let space = Account::LEN as u64;
        invoke_signed(
            &create_account(
                funder_info.key,
                stake_pool_info.key,
                lamports,
                space,
                &spl_token::id(),
            ),
            &[funder_info.clone(), stake_pool_info.clone()],
            &[&[b"stakepool", &[stake_pool_seed]]],
        )?;

        msg!("stake pool account created");

        invoke(
            &spl_token::instruction::initialize_account(
                &spl_token::id(),
                stake_pool_info.key,
                token_info.key,
                pool_authority_info.key,
            )?,
            &[
                stake_pool_info.clone(),
                token_info.clone(),
                rent_info.clone(),
                pool_authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        msg!("stake pool account initialized");

        // create reward pool
        let reward_pool_seed =
            RewardPool::verify_program_address(reward_pool_info.key, program_id)?;

        invoke_signed(
            &create_account(
                funder_info.key,
                reward_pool_info.key,
                lamports, // same lamports/space as prev account
                space,
                &spl_token::id(),
            ),
            &[funder_info.clone(), reward_pool_info.clone()],
            &[&[b"rewardpool", &[reward_pool_seed]]],
        )?;
        msg!("reward pool account created");

        invoke(
            &spl_token::instruction::initialize_account(
                &spl_token::id(),
                reward_pool_info.key,
                token_info.key,
                pool_authority_info.key,
            )?,
            &[
                reward_pool_info.clone(),
                token_info.clone(),
                rent_info.clone(),
                pool_authority_info.clone(),
                token_program_info.clone(),
            ],
        )
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
            reward_debt: 0,
            pending_reward: 0,
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
                reward_debt: 0,
                pending_reward: 0,
            }
        } else {
            msg!("No secondary account");
            Beneficiary {
                staked: 0,
                authority: ZERO_KEY,
                reward_debt: 0,
                pending_reward: 0,
            }
        };

        let community = Community {
            creation_date: clock.unix_timestamp,
            authority: *creator_info.key,
            primary,
            secondary,
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

        verify_associated!(staker_associated_info, settings.token, *staker_info.key)?;

        let seed = Stake::verify_program_address(
            stake_info.key,
            community_info.key,
            staker_info.key,
            program_id,
        )?;

        let stake = Stake {
            creation_date: clock.unix_timestamp,
            staked: 0,
            beneficiary: Beneficiary {
                authority: *staker_info.key,
                staked: 0,
                reward_debt: 0,
                pending_reward: 0,
            },
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
        let pool_authority_info = next_account_info(iter)?;
        let stake_pool_info = next_account_info(iter)?;
        let reward_pool_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let mut settings = Settings::from_account_info(settings_info, program_id)?;
        let mut community = Community::from_account_info(community_info, program_id)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let staker_assoc =
            verify_associated!(staker_associated_info, settings.token, *staker_info.key)?;

        let mut stake =
            Stake::from_account_info(stake_info, community_info.key, staker_info.key, program_id)?;
        if stake.staked + amount < MINIMUM_STAKE {
            return Err(StakingError::StakerMinimumBalanceNotMet.into());
        }

        settings.update_rewards(clock.unix_timestamp);

        stake.staked += amount;
        let (staker_share, primary, secondary) = split_stake(stake.staked);

        // PROCESS STAKER'S REWARD

        stake
            .beneficiary
            .pay_out(staker_share, settings.reward_per_share);

        // allow them to re-stake their pending reward immediately
        if staker_assoc.amount + stake.beneficiary.pending_reward < amount {
            return Err(StakingError::StakerBalanceTooLow.into());
        }

        // primary + secondary
        community
            .primary
            .pay_out(primary, settings.reward_per_share);
        if !community.secondary.is_empty() {
            community
                .secondary
                .pay_out(secondary, settings.reward_per_share);
        }

        // pay out pending reward first
        pool_transfer!(
            RewardPool,
            reward_pool_info,
            staker_associated_info,
            pool_authority_info,
            program_id,
            stake.beneficiary.pending_reward
        )?;
        stake.beneficiary.pending_reward = 0;

        // transfer the new staked amount to stake pool
        invoke(
            &spl_token::instruction::transfer(
                &spl_token::id(),
                staker_associated_info.key,
                stake_pool_info.key,
                staker_info.key,
                &[],
                amount,
            )?,
            &[
                staker_associated_info.clone(),
                stake_pool_info.clone(),
                staker_info.clone(),
            ],
        )?;

        settings.total_stake += amount;

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
        let pool_authority_info = next_account_info(iter)?;
        let reward_pool_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let mut settings = Settings::from_account_info(settings_info, program_id)?;
        let mut community = Community::from_account_info(community_info, program_id)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let mut stake =
            Stake::from_account_info(stake_info, community_info.key, staker_info.key, program_id)?;
        if amount > stake.staked {
            return Err(StakingError::StakerWithdrawingTooMuch.into());
        } else if amount < stake.staked && stake.staked - amount < MINIMUM_STAKE {
            // allow them to withdraw everything
            return Err(StakingError::StakerMinimumBalanceNotMet.into());
        }

        settings.update_rewards(clock.unix_timestamp);

        stake.staked -= amount;
        let (staker_share, primary, secondary) = split_stake(stake.staked);

        // PROCESS STAKER'S REWARD

        stake
            .beneficiary
            .pay_out(staker_share, settings.reward_per_share);

        // primary + secondary
        community
            .primary
            .pay_out(primary, settings.reward_per_share);
        if !community.secondary.is_empty() {
            community
                .secondary
                .pay_out(secondary, settings.reward_per_share);
        }

        // pay out pending reward
        pool_transfer!(
            RewardPool,
            reward_pool_info,
            staker_associated_info,
            pool_authority_info,
            program_id,
            stake.beneficiary.pending_reward
        )?;
        stake.beneficiary.pending_reward = 0;

        stake.unbonding_amount += amount;
        stake.unbonding_start = clock.unix_timestamp;

        settings.total_stake -= amount;

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
        let pool_authority_info = next_account_info(iter)?;
        let stake_pool_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let settings = Settings::from_account_info(settings_info, program_id)?;
        // not verifying community, we just need an existing pubkey to check stake program address

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        verify_associated!(staker_associated_info, settings.token, *staker_info.key)?;

        let mut stake =
            Stake::from_account_info(stake_info, community_info.key, staker_info.key, program_id)?;

        if stake.unbonding_amount == 0 {
            return Err(StakingError::WithdrawNothingtowithdraw.into());
        }

        if clock.unix_timestamp - stake.unbonding_start < crate::UNBONDING_PERIOD {
            return Err(StakingError::WithdrawUnbondingTimeNotOverYet.into());
        }

        pool_transfer!(
            StakePool,
            stake_pool_info,
            staker_associated_info,
            pool_authority_info,
            program_id,
            stake.unbonding_amount
        )?;

        stake.unbonding_amount = 0;
        stake.unbonding_start = clock.unix_timestamp;

        stake_info
            .data
            .borrow_mut()
            .copy_from_slice(&stake.try_to_vec()?);

        Ok(())
    }

    pub fn process_claim(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        primary: bool,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;
        let authority_info = next_account_info(iter)?;
        let authority_associated_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let pool_authority_info = next_account_info(iter)?;
        let reward_pool_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let mut settings = Settings::from_account_info(settings_info, program_id)?;
        let mut community = Community::from_account_info(community_info, program_id)?;

        if !authority_info.is_signer {
            return Err(StakingError::AuthorizedSignatureMissing.into());
        }

        let beneficiary = if primary {
            &mut community.primary
        } else {
            &mut community.secondary
        };

        if beneficiary.authority != *authority_info.key {
            return Err(StakingError::AuthorizedSignatureMissing.into());
        }

        verify_associated!(
            authority_associated_info,
            settings.token,
            *authority_info.key
        )?;

        settings.update_rewards(clock.unix_timestamp);

        // the stake amount doesn't change, so there's no need to update staker/secondary at the same time
        beneficiary.pay_out(beneficiary.staked, settings.reward_per_share);
        // pay out pending reward
        pool_transfer!(
            RewardPool,
            reward_pool_info,
            authority_associated_info,
            pool_authority_info,
            program_id,
            beneficiary.pending_reward
        )?;
        beneficiary.pending_reward = 0;

        settings_info
            .data
            .borrow_mut()
            .copy_from_slice(&settings.try_to_vec()?);
        community_info
            .data
            .borrow_mut()
            .copy_from_slice(&community.try_to_vec()?);

        Ok(())
    }
}
