use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::account_info::AccountInfo;
use solana_program::clock::UnixTimestamp;

use solana_program::{program_error::ProgramError, pubkey::Pubkey};

use crate::error::StakingError;
use crate::split_stake;
use bigint::U256 as OrigU256;
use std::io::Read;
use std::io::{Result as IOResult, Write};

#[repr(transparent)]
#[derive(Debug, PartialEq, Clone, Copy, Eq)]
pub struct U256(OrigU256);
impl BorshSerialize for U256 {
    fn serialize<W: Write>(&self, writer: &mut W) -> IOResult<()> {
        let mut buf = [0u8; 32];
        self.0.to_little_endian(&mut buf);
        writer.write(&buf)?;
        Ok(())
    }
}
impl BorshDeserialize for U256 {
    fn deserialize(buf: &mut &[u8]) -> IOResult<Self> {
        let mut ubuf = [0u8; 32];
        buf.read_exact(&mut ubuf)?;
        Ok(U256(OrigU256::from_little_endian(&ubuf)))
    }
}

impl From<u64> for U256 {
    fn from(a: u64) -> Self {
        U256(OrigU256::from(a))
    }
}

#[repr(C)]
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Settings {
    pub token: Pubkey,
    pub authority: Pubkey,

    // tokenomics variables
    pub total_stake: u64,
    pub reward_per_share: U256,
    pub last_reward: UnixTimestamp,
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

/// Transfer ZEE from Stake Pool
///
/// The recipient has to be verified to be ZEE before this is used.
#[macro_export]
macro_rules! stake_pool_transfer {
    ($pool:expr, $recipient:expr, $program:expr, $amount:expr) => {
        match StakePool::verify_program_address($pool.key, $program) {
            Ok(seed) => invoke_signed(
                &spl_token::instruction::transfer(
                    &spl_token::id(),
                    $pool.key,
                    $recipient.key,
                    $program,
                    &[],
                    $amount,
                )?,
                &[$pool.clone(), $recipient.clone()],
                &[&[b"stakepool", &[seed]]],
            ),
            Err(err) => Err(err),
        }
    };
}
/// Transfer ZEE from Reward Fund
///
/// The recipient has to be verified to be ZEE before this is used.
#[macro_export]
macro_rules! reward_fund_transfer {
    ($fund:expr, $recipient:expr, $program:expr, $amount:expr) => {
        match RewardFund::verify_program_address($fund.key, $program) {
            Ok(seed) => invoke_signed(
                &spl_token::instruction::transfer(
                    &spl_token::id(),
                    $fund.key,
                    $recipient.key,
                    $program,
                    &[],
                    $amount,
                )?,
                &[$fund.clone(), $recipient.clone()],
                &[&[b"rewardfund", &[seed]]],
            ),
            Err(err) => Err(err),
        }
    };
}

#[macro_export]
macro_rules! verify_associated {
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

/// Stake Pool
///
/// The stake pool is the token address that all ZEE are stored at when they are
/// staked by users. The ZEE is returned when someone withdraws their stake but
/// is not touched otherwise.
#[derive(Debug, PartialEq, Clone, Copy, Eq)]
pub struct StakePool {}
impl StakePool {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"stakepool"], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidStakePoolAccount.into()),
        }
    }
}

/// Reward Fund
///
/// The reward fund is the token address that pays out yield.
#[derive(Debug, PartialEq, Clone, Copy, Eq)]
pub struct RewardFund {}
impl RewardFund {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"rewardfund"], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidRewardFundAccount.into()),
        }
    }
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Community {
    pub creation_date: UnixTimestamp,
    pub authority: Pubkey,
    pub primary: Beneficiary,
    pub secondary: Beneficiary,
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Beneficiary {
    pub authority: Pubkey,
    pub address: Pubkey,

    pub staked: u64,
    pub reward_debt: U256,
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

#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Stake {
    pub creation_date: UnixTimestamp,

    pub total_stake: u64,
    pub self_stake: u64,
    pub primary_stake: u64,
    pub secondary_stake: u64,
    pub reward_debt: U256,

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

    pub fn from_account_info(
        info: &AccountInfo,
        community: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<Stake, ProgramError> {
        Stake::verify_program_address(info.key, community, staker, program_id)?;
        Stake::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::StakerInvalidStakeAccount.into())
    }

    pub fn add_stake(&mut self, amount: u64) -> (u64, u64) {
        self.total_stake += amount;
        let split = split_stake(self.total_stake);
        // a bigger split is always >=, this difference should be safe
        let d_primary = split.1 - self.primary_stake;
        let d_secondary = split.2 - self.secondary_stake;
        self.self_stake = split.0;
        self.primary_stake = split.1;
        self.secondary_stake = split.2;
        (d_primary, d_secondary)
    }

    pub fn remove_stake(&mut self, amount: u64) -> (u64, u64) {
        self.total_stake -= amount;
        let split = split_stake(self.total_stake);
        // a smaller split is always <=, this difference should be safe
        let d_primary = self.primary_stake - split.1;
        let d_secondary = self.secondary_stake - split.2;
        self.self_stake = split.0;
        self.primary_stake = split.1;
        self.secondary_stake = split.2;
        (d_primary, d_secondary)
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    pub fn test_settings_serialization() {
        let v = Settings {
            token: Pubkey::new_unique(),
            authority: Pubkey::new_unique(),

            reward_per_share: U256::from(348923452348342394u64),
            last_reward: 293458234234,
            total_stake: 9821429382935u64,
        };

        let data = v.try_to_vec().unwrap();
        let ret = Settings::try_from_slice(&data).unwrap();

        assert_eq!(v, ret);
    }
}
