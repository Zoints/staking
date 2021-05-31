use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    system_instruction::create_account,
    sysvar::{rent::Rent, Sysvar},
};

use spl_token::state::{Account, Mint};

use crate::{account::Settings, error::StakingError, instruction::StakingInstruction};

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

        Settings::verify_program_address(settings_info.key, program_id)?;
        Mint::unpack(&token_info.data.borrow()).map_err(|_| StakingError::TokenNotSPLToken)?;

        let settings = Settings {
            sponsor_fee,
            authority: *authority_info.key,
            token: *token_info.key,
        };

        let data = settings.try_to_vec()?;

        let space = data.len();
        let lamports = rent.minimum_balance(space);

        invoke(
            &create_account(
                funder_info.key,
                settings_info.key,
                lamports,
                space as u64,
                program_id,
            ),
            &[funder_info.clone(), settings_info.clone()],
        )?;

        settings_info.data.borrow_mut().copy_from_slice(&data);
        Ok(())
    }
}
