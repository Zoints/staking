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

impl Community {
    pub fn from_account_info(
        info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Community, ProgramError> {
        if info.owner != program_id {
            return Err(StakingError::InvalidCommunityAccount.into());
        }

        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::InvalidCommunityAccount.into())
    }
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Stake {
    pub creation_date: UnixTimestamp,
    pub total_stake: u64,
    pub self_stake: u64,
    pub primary_stake: u64,
    pub secondary_stake: u64,
    pub last_action: UnixTimestamp,
    pub unclaimed: u64,
    pub unbonding_start: UnixTimestamp,
    pub unbonding_amount: u64,
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

#[repr(C)]
#[derive(Clone, Debug, PartialEq, BorshSerialize, BorshDeserialize, Eq, PartialOrd, Ord)]
pub struct StakePayout(u128);

impl StakePayout {
    pub const SCALE: u128 = 10_000_000_000_000_000_000;

    pub fn new(amount: u64) -> Self {
        StakePayout(amount as u128 * Self::SCALE)
    }

    pub fn get(&self) -> u64 {
        (self.0 / Self::SCALE) as u64
    }

    pub fn remainder(&self) -> u64 {
        (self.0 % Self::SCALE) as u64
    }
}

impl std::ops::Div<u128> for StakePayout {
    type Output = StakePayout;
    fn div(self, other: u128) -> Self::Output {
        StakePayout(self.0 / other)
    }
}

impl std::ops::DivAssign<u128> for StakePayout {
    fn div_assign(&mut self, other: u128) {
        self.0 /= other;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_stake_amount() {
        let mut stake = StakePayout::new(5_000);
        stake /= 365 * 24 * 3600 * 10;

        assert_eq!(stake, StakePayout(158548959918822));
        assert_eq!(stake.get(), 0);
        assert_eq!(stake.remainder(), 158548959918822);

        println!("{:0>1}.{:0>19}", stake.get(), stake.remainder());
    }
}
