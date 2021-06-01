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
    account::{Beneficiary, Community, Settings},
    error::StakingError,
    instruction::StakingInstruction,
    ZERO_KEY,
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
        let token_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;

        if !authority_info.is_signer {
            return Err(StakingError::MissingAuthoritySignature.into());
        }

        if settings_info.data_len() > 0 {
            return Err(StakingError::ProgramAlreadyInitialized.into());
        }

        let seed = Settings::verify_program_address(settings_info.key, program_id)?;
        Mint::unpack(&token_info.data.borrow()).map_err(|_| StakingError::TokenNotSPLToken)?;

        let settings = Settings {
            sponsor_fee,
            authority: *authority_info.key,
            token: *token_info.key,
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
        Ok(())
    }
    pub fn process_register_community(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let primary_info = next_account_info(iter)?;
        let primary_associated_info = next_account_info(iter)?;
        let secondary_info = next_account_info(iter)?;
        let secondary_associated_info = next_account_info(iter)?;
        let referrer_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;

        let rent = Rent::from_account_info(rent_info)?;
        let clock = Clock::from_account_info(clock_info)?;

        if settings_info.data_len() == 0 {
            return Err(StakingError::ProgramNotInitialized.into());
        }
        Settings::verify_program_address(settings_info.key, program_id)?;
        let settings = Settings::try_from_slice(&settings_info.data.borrow())?;

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
            unclaimed: 0,
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
                unclaimed: 0,
            }
        } else {
            Beneficiary {
                staked: 0,
                authority: ZERO_KEY,
                address: ZERO_KEY,
                unclaimed: 0,
            }
        };

        let community = Community {
            creation_date: clock.unix_timestamp,
            last_action: clock.unix_timestamp,
            primary,
            secondary,
            referrer: *referrer_info.key,
        };

        let data = community.try_to_vec()?;

        let lamports = rent.minimum_balance(data.len());
        let space = data.len() as u64;

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
}
