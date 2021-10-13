use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::{Clock, UnixTimestamp},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_option::COption,
    program_pack::Pack,
    pubkey::Pubkey,
    system_instruction::create_account,
    sysvar::{rent::Rent, Sysvar},
};

use spl_token::state::{Account, Mint};

use crate::{
    account::{Beneficiary, Endpoint, OwnerType, PoolAuthority, RewardPool, Settings, Stake},
    error::StakingError,
    instruction::StakingInstruction,
    pool_transfer, split_stake, verify_associated, BASE_REWARD, MINIMUM_STAKE, SECONDS_PER_YEAR,
};

/// Verifies that an account is a valid mint for an NFT
#[macro_export]
macro_rules! is_nft_mint {
    ($data:expr) => {
        match Mint::unpack(&$data) {
            Ok(mint) => {
                if !mint.is_initialized {
                    msg!("not initialized");
                    Err(StakingError::NFTOwnerNotNFT)
                } else if mint.decimals != 0 {
                    msg!("invalid decimals");
                    Err(StakingError::NFTOwnerNotNFT)
                } else if mint.supply != 1 {
                    msg!("invalid supply");
                    Err(StakingError::NFTOwnerNotNFT)
                } else if mint.mint_authority != COption::None {
                    msg!("mint authority is not locked");
                    Err(StakingError::NFTOwnerNotNFT)
                } else {
                    Ok(mint)
                }
            }
            _ => Err(StakingError::NFTOwnerNotNFT),
        }
    };
}

/// Transfer ZEE from a Pool
///
/// The type of pool (RewardPool/StakePool) has to be specified as the first parameter.
/// The recipient has to be verified to be ZEE before this is used.
#[macro_export]
macro_rules! pool_transfer {
    ($fund_type:ident, $fund:expr, $recipient:expr, $authority:expr, $program_id:expr, $amount:expr) => {
        match PoolAuthority::verify_program_address($authority.key, $program_id) {
            Ok(seed) => match $fund_type::verify_program_address($fund.key, $program_id) {
                Ok(_) => invoke_signed(
                    &spl_token::instruction::transfer(
                        &spl_token::id(),
                        $fund.key,
                        $recipient.key,
                        $authority.key,
                        &[],
                        $amount,
                    )?,
                    &[$fund.clone(), $recipient.clone(), $authority.clone()],
                    &[&[b"poolauthority", &[seed]]],
                ),
                Err(err) => Err(err),
            },
            Err(err) => Err(err),
        }
    };
}
/// Verify an Associated Account
///
/// Shortcut macro to verify that a passed associated account is of a specific SPL Token.
/// If an owner is passed along, it will additionall check if the associated account
/// is owned by that address.
#[macro_export]
macro_rules! verify_associated {
    ($assoc:expr, $token:expr) => {
        match Account::unpack(&$assoc.data.borrow()) {
            Ok(account) => {
                if account.mint != $token {
                    Err(StakingError::AssociatedInvalidToken.into())
                } else {
                    Ok(account)
                }
            }
            _ => Err(StakingError::AssociatedInvalidAccount),
        }
    };
    ($assoc:expr, $token:expr, $owner:expr) => {
        match Account::unpack(&$assoc.data.borrow()) {
            Ok(account) => {
                if account.mint != $token {
                    Err(StakingError::AssociatedInvalidToken.into())
                } else if account.owner != $owner {
                    Err(StakingError::AssociatedInvalidOwner.into())
                } else {
                    Ok(account)
                }
            }
            _ => Err(StakingError::AssociatedInvalidAccount),
        }
    };
}

#[macro_export]
macro_rules! create_beneficiary {
    ($beneficiary_info:expr, $authority:expr, $funder_info:expr, $rent:expr, $program_id:expr) => {
        let seed =
            Beneficiary::verify_program_address($beneficiary_info.key, $authority, $program_id)?;
        let beneficiary = Beneficiary {
            authority: *$authority,
            staked: 0,
            reward_debt: 0,
            holding: 0,
        };
        let data = beneficiary.try_to_vec()?;

        let space = data.len();
        let lamports = $rent.minimum_balance(space);

        invoke_signed(
            &create_account(
                $funder_info.key,
                $beneficiary_info.key,
                lamports,
                space as u64,
                $program_id,
            ),
            &[$funder_info.clone(), $beneficiary_info.clone()],
            &[&[b"beneficiary", &$authority.to_bytes(), &[seed]]],
        )?;
        $beneficiary_info.data.borrow_mut().copy_from_slice(&data);
    };
}

pub struct Processor {}
impl Processor {
    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = StakingInstruction::try_from_slice(input)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        msg!("Staking Instruction :: {:?}", instruction);

        match instruction {
            StakingInstruction::Initialize {
                start_time,
                unbonding_duration,
            } => Self::process_initialize(program_id, accounts, start_time, unbonding_duration),
            StakingInstruction::RegisterEndpoint { owner_type } => {
                Self::process_register_endpoint(program_id, accounts, owner_type)
            }
            StakingInstruction::InitializeStake => {
                Self::process_initialize_stake(program_id, accounts)
            }
            StakingInstruction::Stake { amount } => {
                Self::process_stake(program_id, accounts, amount)
            }
            StakingInstruction::WithdrawUnbond => {
                Self::process_withdraw_unbond(program_id, accounts)
            }
            StakingInstruction::Claim => Self::process_claim(program_id, accounts),
        }
    }

    pub fn process_initialize(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        start_time: UnixTimestamp,
        unbonding_duration: u64,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let pool_authority_info = next_account_info(iter)?;
        let reward_pool_info = next_account_info(iter)?;
        let token_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let token_program_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;

        if settings_info.data_len() > 0 {
            return Err(StakingError::ProgramAlreadyInitialized.into());
        }

        let settings_seed = Settings::verify_program_address(settings_info.key, program_id)?;
        Mint::unpack(&token_info.data.borrow()).map_err(|_| StakingError::TokenNotSPLToken)?;

        let settings = Settings {
            token: *token_info.key,
            unbonding_duration,
            next_emission_change: start_time + SECONDS_PER_YEAR as i64,
            emission: BASE_REWARD as u64,
            reward_per_share: 0u128,
            last_reward: start_time,
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
            &[&[b"settings", &[settings_seed]]],
        )?;
        settings_info.data.borrow_mut().copy_from_slice(&data);

        msg!("Settings account created");

        // create reward pool
        let space = Account::LEN as u64;
        let lamports = rent.minimum_balance(Account::LEN);
        let reward_pool_seed =
            RewardPool::verify_program_address(reward_pool_info.key, program_id)?;

        invoke_signed(
            &create_account(
                funder_info.key,
                reward_pool_info.key,
                lamports,
                space,
                &spl_token::id(),
            ),
            &[funder_info.clone(), reward_pool_info.clone()],
            &[&[b"rewardpool", &[reward_pool_seed]]],
        )?;
        msg!(
            "reward pool account created: {}",
            reward_pool_info.key.to_string()
        );

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

    pub fn process_register_endpoint(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        owner_type: OwnerType,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let owner_info = next_account_info(iter)?;
        let endpoint_info = next_account_info(iter)?;
        let primary_info = next_account_info(iter)?;
        let primary_beneficiary_info = next_account_info(iter)?;
        let secondary_info = next_account_info(iter)?;
        let secondary_beneficiary_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;

        match owner_type {
            OwnerType::Basic => {}
            OwnerType::NFT => {
                is_nft_mint!(owner_info.data.borrow())?;
            }
        };

        if !endpoint_info.data_is_empty() {
            return Err(StakingError::EndpointAccountAlreadyExists.into());
        }

        if primary_beneficiary_info.data_is_empty() {
            create_beneficiary!(
                primary_beneficiary_info,
                primary_info.key,
                funder_info,
                &rent,
                program_id
            );
            msg!("Primary Beneficiary created");
        }

        if secondary_beneficiary_info.data_is_empty() {
            create_beneficiary!(
                secondary_beneficiary_info,
                secondary_info.key,
                funder_info,
                &rent,
                program_id
            );
            msg!("Secondary Beneficiary created");
        }

        let endpoint = Endpoint {
            creation_date: clock.unix_timestamp,
            total_stake: 0,
            owner: *owner_info.key,
            owner_type,
            primary: *primary_info.key,
            secondary: *secondary_info.key,
        };

        let data = endpoint.try_to_vec()?;

        let lamports = rent.minimum_balance(data.len());
        let space = data.len() as u64;

        msg!("Registering Endpoint: {:?}", endpoint);
        invoke(
            &create_account(
                funder_info.key,
                endpoint_info.key,
                lamports,
                space,
                program_id,
            ),
            &[funder_info.clone(), endpoint_info.clone()],
        )?;

        endpoint_info.data.borrow_mut().copy_from_slice(&data);

        Ok(())
    }

    pub fn process_initialize_stake(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_fund_info = next_account_info(iter)?;
        let staker_beneficiary_info = next_account_info(iter)?;
        let endpoint_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;

        let token_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;

        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;
        let token_program_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let settings = Settings::from_account_info(settings_info, program_id)?;
        if settings.token != *token_info.key {
            return Err(StakingError::InvalidToken.into());
        }

        Endpoint::from_account_info(endpoint_info, program_id)?;

        let seed = Stake::verify_program_address(
            stake_info.key,
            endpoint_info.key,
            staker_info.key,
            program_id,
        )?;

        let stake = Stake {
            creation_date: clock.unix_timestamp,
            total_stake: 0,
            staker: *staker_info.key,
            unbonding_end: clock.unix_timestamp,
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
                &endpoint_info.key.to_bytes(),
                &staker_info.key.to_bytes(),
                &[seed],
            ]],
        )?;

        stake_info
            .data
            .borrow_mut()
            .copy_from_slice(&stake.try_to_vec()?);

        if staker_beneficiary_info.data_is_empty() {
            create_beneficiary!(
                staker_beneficiary_info,
                staker_info.key,
                funder_info,
                &rent,
                program_id
            );
            msg!("Staker Beneficiary created");
        }

        // create staker fund
        let space = Account::LEN as u64;
        let lamports = rent.minimum_balance(Account::LEN);
        let staker_fund_seed = Stake::verify_fund_address(
            staker_fund_info.key,
            endpoint_info.key,
            staker_info.key,
            program_id,
        )?;

        invoke_signed(
            &create_account(
                funder_info.key,
                staker_fund_info.key,
                lamports,
                space,
                &spl_token::id(),
            ),
            &[funder_info.clone(), staker_fund_info.clone()],
            &[&[
                b"stake fund",
                endpoint_info.key.as_ref(),
                staker_info.key.as_ref(),
                &[staker_fund_seed],
            ]],
        )?;
        msg!("staker fund account created");

        invoke(
            &spl_token::instruction::initialize_account(
                &spl_token::id(),
                staker_fund_info.key,
                token_info.key,
                stake_info.key,
            )?,
            &[
                staker_fund_info.clone(),
                token_info.clone(),
                rent_info.clone(),
                stake_info.clone(),
                token_program_info.clone(),
            ],
        )
    }

    pub fn process_stake(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        raw_amount: i64,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_beneficiary_info = next_account_info(iter)?;
        let staker_fund_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let endpoint_info = next_account_info(iter)?;
        let primary_beneficiary_info = next_account_info(iter)?;
        let secondary_beneficiary_info = next_account_info(iter)?;
        let pool_authority_info = next_account_info(iter)?;
        let reward_pool_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        let mut settings = Settings::from_account_info(settings_info, program_id)?;

        let mut endpoint = Endpoint::from_account_info(endpoint_info, program_id)?;
        let mut primary_beneficiary = Beneficiary::from_account_info(
            primary_beneficiary_info,
            &endpoint.primary,
            program_id,
        )?;
        let mut secondary_beneficiary = Beneficiary::from_account_info(
            secondary_beneficiary_info,
            &endpoint.secondary,
            program_id,
        )?;

        let staker_assoc =
            verify_associated!(staker_associated_info, settings.token, *staker_info.key)?;

        let mut stake =
            Stake::from_account_info(stake_info, endpoint_info.key, staker_info.key, program_id)?;
        let mut staker_beneficiary =
            Beneficiary::from_account_info(staker_beneficiary_info, staker_info.key, program_id)?;

        let staking = raw_amount >= 0;
        let amount = raw_amount.abs() as u64;

        if staking {
            if stake.total_stake + amount < MINIMUM_STAKE {
                msg!(
                    "existing stake: {}, amount: {}, minimum required: {}",
                    stake.total_stake,
                    amount,
                    MINIMUM_STAKE
                );
                return Err(StakingError::StakerMinimumBalanceNotMet.into());
            }
        } else {
            if amount > stake.total_stake {
                return Err(StakingError::StakerWithdrawingTooMuch.into());
            } else if amount < stake.total_stake && stake.total_stake - amount < MINIMUM_STAKE {
                // allow them to withdraw everything
                return Err(StakingError::StakerMinimumBalanceNotMet.into());
            }
        }

        settings.update_rewards(clock.unix_timestamp);

        let (old_staker, old_primary, old_secondary) = split_stake(stake.total_stake);
        if staking {
            stake.total_stake += amount;
            endpoint.total_stake += amount;
            settings.total_stake += amount;
        } else {
            stake.total_stake -= amount;
            endpoint.total_stake -= amount;
            settings.total_stake -= amount;
        }
        let (new_staker, new_primary, new_secondary) = split_stake(stake.total_stake);

        // PROCESS STAKER'S REWARD

        staker_beneficiary.pay_out(
            staker_beneficiary.staked + new_staker - old_staker,
            settings.reward_per_share,
        );

        // allow them to re-stake their pending reward immediately
        if staking && staker_assoc.amount + staker_beneficiary.holding < amount {
            return Err(StakingError::StakerBalanceTooLow.into());
        }

        // primary + secondary
        primary_beneficiary.pay_out(
            primary_beneficiary.staked + new_primary - old_primary,
            settings.reward_per_share,
        );
        secondary_beneficiary.pay_out(
            secondary_beneficiary.staked + new_secondary - old_secondary,
            settings.reward_per_share,
        );

        // pay out pending reward first
        pool_transfer!(
            RewardPool,
            reward_pool_info,
            staker_associated_info,
            pool_authority_info,
            program_id,
            staker_beneficiary.holding
        )?;
        msg!("zee claimed: {}", staker_beneficiary.holding);
        staker_beneficiary.holding = 0;

        if staking {
            // transfer the new staked amount to fund pool
            invoke(
                &spl_token::instruction::transfer(
                    &spl_token::id(),
                    staker_associated_info.key,
                    staker_fund_info.key,
                    staker_info.key,
                    &[],
                    amount,
                )?,
                &[
                    staker_associated_info.clone(),
                    staker_fund_info.clone(),
                    staker_info.clone(),
                ],
            )?;
        } else {
            stake.unbonding_amount += amount;
            stake.unbonding_end = settings.unbonding_duration as i64 + clock.unix_timestamp;
        }

        settings_info
            .data
            .borrow_mut()
            .copy_from_slice(&settings.try_to_vec()?);
        stake_info
            .data
            .borrow_mut()
            .copy_from_slice(&stake.try_to_vec()?);

        endpoint_info
            .data
            .borrow_mut()
            .copy_from_slice(&endpoint.try_to_vec()?);

        staker_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(&staker_beneficiary.try_to_vec()?);
        primary_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(&primary_beneficiary.try_to_vec()?);
        secondary_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(&secondary_beneficiary.try_to_vec()?);

        Ok(())
    }

    pub fn process_withdraw_unbond(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_fund_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let endpoint_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let settings = Settings::from_account_info(settings_info, program_id)?;
        // not verifying endpoint, we just need an existing pubkey to check stake program address

        if !staker_info.is_signer {
            return Err(StakingError::MissingStakeSignature.into());
        }

        verify_associated!(staker_associated_info, settings.token, *staker_info.key)?;

        let stake_seed = Stake::verify_program_address(
            stake_info.key,
            endpoint_info.key,
            staker_info.key,
            program_id,
        )?;
        let mut stake =
            Stake::from_account_info(stake_info, endpoint_info.key, staker_info.key, program_id)?;

        if stake.unbonding_amount == 0 {
            return Err(StakingError::WithdrawNothingtowithdraw.into());
        }

        if clock.unix_timestamp < stake.unbonding_end {
            return Err(StakingError::WithdrawUnbondingTimeNotOverYet.into());
        }

        Stake::verify_fund_address(
            staker_fund_info.key,
            endpoint_info.key,
            staker_info.key,
            program_id,
        )?;

        invoke_signed(
            &spl_token::instruction::transfer(
                &spl_token::id(),
                staker_fund_info.key,
                staker_associated_info.key,
                stake_info.key,
                &[],
                stake.unbonding_amount,
            )?,
            &[
                staker_fund_info.clone(),
                staker_associated_info.clone(),
                stake_info.clone(),
            ],
            &[&[
                b"stake",
                &endpoint_info.key.to_bytes(),
                &staker_info.key.to_bytes(),
                &[stake_seed],
            ]],
        )?;
        msg!("zee amount transferred: {}", stake.unbonding_amount);

        stake.unbonding_amount = 0;
        stake.unbonding_end = clock.unix_timestamp;

        stake_info
            .data
            .borrow_mut()
            .copy_from_slice(&stake.try_to_vec()?);

        Ok(())
    }

    pub fn process_claim(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;

        let authority_info = next_account_info(iter)?;
        let beneficiary_info = next_account_info(iter)?;
        let authority_associated_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let pool_authority_info = next_account_info(iter)?;
        let reward_pool_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let mut settings = Settings::from_account_info(settings_info, program_id)?;

        if !authority_info.is_signer {
            return Err(StakingError::MissingAuthoritySignature.into());
        }

        settings.update_rewards(clock.unix_timestamp);

        let mut beneficiary =
            Beneficiary::from_account_info(beneficiary_info, authority_info.key, program_id)?;

        verify_associated!(
            authority_associated_info,
            settings.token,
            *authority_info.key
        )?;

        // the stake amount doesn't change, so there's no need to update staker
        beneficiary.pay_out(beneficiary.staked, settings.reward_per_share);
        // pay out pending reward
        pool_transfer!(
            RewardPool,
            reward_pool_info,
            authority_associated_info,
            pool_authority_info,
            program_id,
            beneficiary.holding
        )?;
        msg!("zee claimed: {}", beneficiary.holding);
        beneficiary.holding = 0;

        settings_info
            .data
            .borrow_mut()
            .copy_from_slice(&settings.try_to_vec()?);
        beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(&beneficiary.try_to_vec()?);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::program_pack::Pack;
    #[test]
    pub fn test_verify_nft_macro() {
        let mut data = [0; Mint::LEN];

        let ok_mint = Mint {
            mint_authority: COption::None,
            supply: 1,
            decimals: 0,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(ok_mint, &mut data).unwrap();
        assert_eq!(Ok(ok_mint), is_nft_mint!(data));

        let bad_mint_authority = Mint {
            mint_authority: COption::Some(Pubkey::new_unique()),
            supply: 1,
            decimals: 0,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_authority, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));

        let bad_mint_supply = Mint {
            mint_authority: COption::None,
            supply: 2,
            decimals: 0,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_supply, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));

        let bad_mint_decimals = Mint {
            mint_authority: COption::None,
            supply: 1,
            decimals: 10,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_decimals, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));

        let bad_mint_initialized = Mint {
            mint_authority: COption::None,
            supply: 1,
            decimals: 0,
            is_initialized: false,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_initialized, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));
    }
}
