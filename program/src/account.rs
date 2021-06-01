use borsh::{BorshDeserialize, BorshSchema, BorshSerialize};
use solana_program::account_info::AccountInfo;
use solana_program::clock::UnixTimestamp;
use solana_program::{program_error::ProgramError, pubkey::Pubkey};

use crate::error::StakingError;

#[repr(C)]
#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
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
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidSettingsAccount.into()),
        }
    }

    pub fn from_account_info(
        info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Settings, ProgramError> {
        Self::verify_program_address(info.key, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::ProgramNotInitialized.into())
    }
}
#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Community {
    pub creation_date: UnixTimestamp,
    pub last_action: UnixTimestamp,
    pub authority: Pubkey,
    pub primary: Beneficiary,
    pub secondary: Beneficiary,
    pub referrer: Pubkey,
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Beneficiary {
    pub staked: u64,
    pub authority: Pubkey,
    pub address: Pubkey,
    pub unclaimed: u64,
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Stake {
    creation_date: UnixTimestamp,
    total_stake: u64,
    self_stake: u64,
    primary_stake: u64,
    secondary_stake: u64,
    last_action: UnixTimestamp,
    unclaimed: u64,
    unbonding_start: UnixTimestamp,
    unbonding_amount: u64,
}

impl Stake {
    pub fn program_address(
        community: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"stake", &community.to_bytes(), &staker.to_bytes()],
            program_id,
        )
    }

    pub fn verify_program_address(
        address: &Pubkey,
        community: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(community, staker, program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidStakeAccount.into()),
        }
    }
}
