use borsh::{BorshDeserialize, BorshSchema, BorshSerialize};
use solana_program::{entrypoint::ProgramResult, program_error::ProgramError, pubkey::Pubkey};

use crate::error::StakingError;

#[repr(C)]
#[derive(
    Debug,
    PartialEq,
    BorshDeserialize,
    BorshSchema,
    BorshSerialize,
    Clone,
    Copy,
    Default,
    Eq,
    Ord,
    PartialOrd,
    Hash,
)]
pub struct Settings {
    pub token: Pubkey,
    pub authority: Pubkey,
    pub sponsor_fee: u64,
}

impl Settings {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"settings"], program_id)
    }

    pub fn verify_program_address(
        &address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == address => Ok(seed),
            _ => Err(StakingError::InvalidSettingsAccount.into()),
        }
    }
}
