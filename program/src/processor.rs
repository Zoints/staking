use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::{Clock, UnixTimestamp},
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
    account::{Authority, Beneficiary, Endpoint, PoolAuthority, RewardPool, Settings, Stake},
    error::StakingError,
    instruction::StakingInstruction,
    pool_transfer, split_stake, verify_associated, BASE_REWARD, MINIMUM_STAKE, SECONDS_PER_YEAR,
};

/// Transfer ZEE from the reward pool
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
    ($beneficiary_info:expr, $authority_info:expr, $funder_info:expr, $rent:expr, $program_id:expr) => {
        let seed = Beneficiary::verify_program_address(
            $beneficiary_info.key,
            $authority_info.key,
            $program_id,
        )?;
        let beneficiary = Beneficiary {
            authority: *$authority_info.key,
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
            &[&[b"beneficiary", &$authority_info.key.to_bytes(), &[seed]]],
        )?;
        $beneficiary_info.data.borrow_mut().copy_from_slice(&data);
    };
}

/// Helper struct to deal with endpoints where multiple beneficiaries are the same.
/// The additions and subtractions to the stake amount are added up in this helper class
/// before being applied to the beneficiary account and paid out at the end
struct WorkingBeneficiary {
    pub beneficiary: Beneficiary,
    pub add: u64,
    pub sub: u64,
}

/// insert a beneficiary without duplication
fn insert_beneficiary(
    beneficiaries: &mut Vec<WorkingBeneficiary>,
    owner: Pubkey,
    beneficiary: Beneficiary,
) -> usize {
    match beneficiaries
        .iter()
        .position(|item| item.beneficiary.authority == owner)
    {
        Some(idx) => idx,
        None => {
            beneficiaries.push(WorkingBeneficiary {
                beneficiary,
                add: 0,
                sub: 0,
            });
            beneficiaries.len() - 1
        }
    }
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
            StakingInstruction::RegisterEndpoint { owner } => {
                Self::process_register_endpoint(program_id, accounts, owner)
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
            StakingInstruction::TransferEndpoint { new_authority } => {
                Self::process_transfer_endpoint(program_id, accounts, new_authority)
            }
            StakingInstruction::ChangeBeneficiaries => {
                Self::process_change_beneficiaries(program_id, accounts)
            }
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
        spl_token::check_program_account(token_program_info.key)?;

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
        owner: Authority,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let endpoint_info = next_account_info(iter)?;
        let owner_info = next_account_info(iter)?;
        let primary_info = next_account_info(iter)?;
        let primary_beneficiary_info = next_account_info(iter)?;
        let secondary_info = next_account_info(iter)?;
        let secondary_beneficiary_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;

        owner.verify(&owner_info)?;

        if !endpoint_info.is_signer {
            return Err(StakingError::InvalidEndpointAccount.into());
        }

        if !endpoint_info.data_is_empty() {
            return Err(StakingError::EndpointAccountAlreadyExists.into());
        }

        if primary_beneficiary_info.data_is_empty() {
            create_beneficiary!(
                primary_beneficiary_info,
                primary_info,
                funder_info,
                &rent,
                program_id
            );
            msg!("Primary Beneficiary account created");
        } else {
            Beneficiary::verify_program_address(
                primary_beneficiary_info.key,
                primary_info.key,
                program_id,
            )?;
        }

        if secondary_beneficiary_info.data_is_empty() {
            create_beneficiary!(
                secondary_beneficiary_info,
                secondary_info,
                funder_info,
                &rent,
                program_id
            );
            msg!("Secondary Beneficiary account created");
        } else {
            Beneficiary::verify_program_address(
                secondary_beneficiary_info.key,
                secondary_info.key,
                program_id,
            )?;
        }

        let endpoint = Endpoint {
            creation_date: clock.unix_timestamp,
            total_stake: 0,
            owner,
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
        spl_token::check_program_account(token_program_info.key)?;

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
                staker_info,
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

        let staker_assoc =
            verify_associated!(staker_associated_info, settings.token, *staker_info.key)?;

        let mut stake =
            Stake::from_account_info(stake_info, endpoint_info.key, staker_info.key, program_id)?;

        // holds the beneficiaries so we don't have duplicate objects
        let mut beneficiaries = vec![];
        let staker_beneficiary = insert_beneficiary(
            &mut beneficiaries,
            *staker_info.key,
            Beneficiary::from_account_info(staker_beneficiary_info, staker_info.key, program_id)?,
        );

        let primary_beneficiary = insert_beneficiary(
            &mut beneficiaries,
            endpoint.primary,
            Beneficiary::from_account_info(
                primary_beneficiary_info,
                &endpoint.primary,
                program_id,
            )?,
        );

        let secondary_beneficiary = insert_beneficiary(
            &mut beneficiaries,
            endpoint.secondary,
            Beneficiary::from_account_info(
                secondary_beneficiary_info,
                &endpoint.secondary,
                program_id,
            )?,
        );

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

        beneficiaries[staker_beneficiary].add += new_staker;
        beneficiaries[staker_beneficiary].sub += old_staker;
        beneficiaries[primary_beneficiary].add += new_primary;
        beneficiaries[primary_beneficiary].sub += old_primary;
        beneficiaries[secondary_beneficiary].add += new_secondary;
        beneficiaries[secondary_beneficiary].sub += old_secondary;

        for working in &mut beneficiaries {
            working.beneficiary.pay_out(
                (working.beneficiary.staked + working.add)
                    .checked_sub(working.sub)
                    .unwrap(),
                settings.reward_per_share,
            );
        }

        // allow them to re-stake their pending reward immediately
        if staking
            && staker_assoc.amount + beneficiaries[staker_beneficiary].beneficiary.holding < amount
        {
            return Err(StakingError::StakerBalanceTooLow.into());
        }
        // pay out pending reward first
        pool_transfer!(
            RewardPool,
            reward_pool_info,
            staker_associated_info,
            pool_authority_info,
            program_id,
            beneficiaries[staker_beneficiary].beneficiary.holding
        )?;
        msg!(
            "zee claimed: {}",
            beneficiaries[staker_beneficiary].beneficiary.holding
        );
        beneficiaries[staker_beneficiary].beneficiary.holding = 0;

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

        // some of these may be write identical data to the same account
        staker_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(&beneficiaries[staker_beneficiary].beneficiary.try_to_vec()?);
        primary_beneficiary_info.data.borrow_mut().copy_from_slice(
            &beneficiaries[primary_beneficiary]
                .beneficiary
                .try_to_vec()?,
        );
        secondary_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(
                &beneficiaries[secondary_beneficiary]
                    .beneficiary
                    .try_to_vec()?,
            );

        Ok(())
    }

    pub fn process_withdraw_unbond(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;

        let stake_info = next_account_info(iter)?;

        let staker_info = next_account_info(iter)?;
        let staker_fund_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;

        let endpoint_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let clock = Clock::from_account_info(clock_info)?;
        let settings = Settings::from_account_info(settings_info, program_id)?;
        Endpoint::from_account_info(endpoint_info, program_id)?;

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

        let mut beneficiary =
            Beneficiary::from_account_info(beneficiary_info, authority_info.key, program_id)?;

        if !authority_info.is_signer {
            return Err(StakingError::MissingAuthoritySignature.into());
        }

        verify_associated!(
            authority_associated_info,
            settings.token,
            *authority_info.key
        )?;

        settings.update_rewards(clock.unix_timestamp);

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

    pub fn process_transfer_endpoint(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        new_owner: Authority,
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let _funder_info = next_account_info(iter)?;
        let endpoint_info = next_account_info(iter)?;
        let owner_info = next_account_info(iter)?;
        let owner_signer_info = next_account_info(iter)?;
        let recipient_info = next_account_info(iter)?;

        let mut endpoint = Endpoint::from_account_info(&endpoint_info, program_id)?;
        if !endpoint.owner.has_signed(&owner_info, &owner_signer_info) {
            return Err(StakingError::MissingAuthoritySignature.into());
        }

        new_owner.verify(&recipient_info)?;

        msg!("transfer endpoint {:?} to {:?}", endpoint, new_owner);

        endpoint.owner = new_owner;

        endpoint_info
            .data
            .borrow_mut()
            .copy_from_slice(&endpoint.try_to_vec()?);

        Ok(())
    }

    pub fn process_change_beneficiaries(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let endpoint_info = next_account_info(iter)?;
        let owner_info = next_account_info(iter)?;
        let owner_signer_info = next_account_info(iter)?;

        let old_primary_beneficiary_info = next_account_info(iter)?;
        let old_secondary_beneficiary_info = next_account_info(iter)?;

        let new_primary_info = next_account_info(iter)?;
        let new_primary_beneficiary_info = next_account_info(iter)?;
        let new_secondary_info = next_account_info(iter)?;
        let new_secondary_beneficiary_info = next_account_info(iter)?;

        let settings_info = next_account_info(iter)?;

        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;

        let mut settings = Settings::from_account_info(settings_info, program_id)?;

        let mut endpoint = Endpoint::from_account_info(&endpoint_info, program_id)?;
        if !endpoint.owner.has_signed(&owner_info, &owner_signer_info) {
            return Err(StakingError::MissingAuthoritySignature.into());
        }

        let mut beneficiaries = vec![];

        let old_primary_beneficiary = insert_beneficiary(
            &mut beneficiaries,
            endpoint.primary,
            Beneficiary::from_account_info(
                old_primary_beneficiary_info,
                &endpoint.primary,
                program_id,
            )?,
        );

        let old_secondary_beneficiary = insert_beneficiary(
            &mut beneficiaries,
            endpoint.secondary,
            Beneficiary::from_account_info(
                old_secondary_beneficiary_info,
                &endpoint.secondary,
                program_id,
            )?,
        );

        if new_primary_beneficiary_info.data_is_empty() {
            create_beneficiary!(
                new_primary_beneficiary_info,
                new_primary_info,
                funder_info,
                &rent,
                program_id
            );
            msg!("Primary Beneficiary account created");
        } else {
            Beneficiary::verify_program_address(
                new_primary_beneficiary_info.key,
                new_primary_info.key,
                program_id,
            )?;
        }

        if new_secondary_beneficiary_info.data_is_empty() {
            create_beneficiary!(
                new_secondary_beneficiary_info,
                new_secondary_info,
                funder_info,
                &rent,
                program_id
            );
            msg!("Secondary Beneficiary account created");
        } else {
            Beneficiary::verify_program_address(
                new_secondary_beneficiary_info.key,
                new_secondary_info.key,
                program_id,
            )?;
        }

        let new_primary_beneficiary = insert_beneficiary(
            &mut beneficiaries,
            *new_primary_info.key,
            Beneficiary::from_account_info(
                new_primary_beneficiary_info,
                new_primary_info.key,
                program_id,
            )?,
        );
        let new_secondary_beneficiary = insert_beneficiary(
            &mut beneficiaries,
            *new_secondary_info.key,
            Beneficiary::from_account_info(
                new_secondary_beneficiary_info,
                new_secondary_info.key,
                program_id,
            )?,
        );

        settings.update_rewards(clock.unix_timestamp);

        let (_, primary_share, secondary_share) = split_stake(endpoint.total_stake);

        msg!(
            "transfering {} stake from old primary to new primary",
            primary_share
        );
        msg!(
            "transfering {} stake from old secondary to new secondary",
            secondary_share
        );

        beneficiaries[old_primary_beneficiary].sub += primary_share;
        beneficiaries[new_primary_beneficiary].add += primary_share;
        beneficiaries[old_secondary_beneficiary].sub += secondary_share;
        beneficiaries[new_secondary_beneficiary].add += secondary_share;

        for working in &mut beneficiaries {
            working.beneficiary.pay_out(
                (working.beneficiary.staked + working.add)
                    .checked_sub(working.sub)
                    .unwrap(),
                settings.reward_per_share,
            );
        }

        msg!(
            "changing endpoint primary from {} to {}",
            endpoint.primary,
            new_primary_info.key
        );
        msg!(
            "changing endpoint secondary from {} to {}",
            endpoint.secondary,
            new_secondary_info.key
        );

        endpoint.primary = *new_primary_info.key;
        endpoint.secondary = *new_secondary_info.key;

        settings_info
            .data
            .borrow_mut()
            .copy_from_slice(&settings.try_to_vec()?);
        old_primary_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(
                &beneficiaries[old_primary_beneficiary]
                    .beneficiary
                    .try_to_vec()?,
            );
        old_secondary_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(
                &beneficiaries[old_secondary_beneficiary]
                    .beneficiary
                    .try_to_vec()?,
            );

        new_primary_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(
                &beneficiaries[new_primary_beneficiary]
                    .beneficiary
                    .try_to_vec()?,
            );
        new_secondary_beneficiary_info
            .data
            .borrow_mut()
            .copy_from_slice(
                &beneficiaries[new_secondary_beneficiary]
                    .beneficiary
                    .try_to_vec()?,
            );

        endpoint_info
            .data
            .borrow_mut()
            .copy_from_slice(&endpoint.try_to_vec()?);

        Ok(())
    }
}

#[cfg(test)]
mod tests {}
