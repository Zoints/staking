use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::account_info::AccountInfo;
use solana_program::clock::UnixTimestamp;

use solana_program::msg;
use solana_program::{program_error::ProgramError, pubkey::Pubkey};

use crate::error::StakingError;
use crate::ZERO_KEY;
use crate::{PRECISION, REWARD_PER_YEAR, SECONDS_PER_YEAR};

#[repr(C)]
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Settings {
    pub token: Pubkey,
    pub authority: Pubkey,
    pub unbonding_time: UnixTimestamp,

    // tokenomics variables
    // for a more detailed explanation of the algorithm and variables
    // see https://www.mathcha.io/editor/j4V1YiODsYQu8dee0NiO39Z05cePQvk0f9qPex6
    pub total_stake: u64,           // total amount of ZEE that has been staked
    pub reward_per_share: u128,     // contains PRECISION
    pub last_reward: UnixTimestamp, // last time the pool was updated
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

    pub fn update_rewards(&mut self, now: UnixTimestamp) {
        if self.last_reward >= now {
            return;
        }

        if self.total_stake > 0 {
            let seconds = (now - self.last_reward) as u128;
            msg!("pool rewards: {} seconds", seconds);
            // The formula is:
            // <time elapsed> * <rewards per second> / <total amount staked>
            // rearranged to make all the multiplications first
            let reward =
                (PRECISION * REWARD_PER_YEAR / SECONDS_PER_YEAR / self.total_stake as u128)
                    * seconds;

            msg!("pool reward delta: {}", reward);

            self.reward_per_share += reward;
        }

        self.last_reward = now;
        msg!(
            "updated pool rewards: last_reward = {}, reward_per_share = {}",
            self.last_reward,
            self.reward_per_share
        );
    }
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

#[macro_export]
macro_rules! pool_burn {
    ($fund:expr,  $authority:expr, $mint:expr, $program_id:expr, $amount:expr) => {
        match PoolAuthority::verify_program_address($authority.key, $program_id) {
            Ok(seed) => match RewardPool::verify_program_address($fund.key, $program_id) {
                Ok(_) => invoke_signed(
                    &spl_token::instruction::burn(
                        &spl_token::id(),
                        $fund.key,
                        $mint.key,
                        $authority.key,
                        &[],
                        $amount,
                    )?,
                    &[$fund.clone(), $authority.clone(), $mint.clone()],
                    &[&[b"poolauthority", &[seed]]],
                ),
                Err(err) => Err(err),
            },
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

#[derive(Debug, PartialEq, Clone, Copy, Eq)]
pub struct PoolAuthority {}
impl PoolAuthority {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"poolauthority"], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidPoolAuthorityAccount.into()),
        }
    }
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
pub struct RewardPool {}
impl RewardPool {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"rewardpool"], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidRewardPoolAccount.into()),
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
pub struct Beneficiary {
    pub authority: Pubkey,

    pub staked: u64,
    pub reward_debt: u64,
    pub pending_reward: u64,
}

impl Beneficiary {
    pub fn is_empty(&self) -> bool {
        self.authority == ZERO_KEY
    }

    pub fn calculate_pending_reward(&self, reward_per_share: u128) -> u64 {
        (self.staked as u128 * reward_per_share / PRECISION) as u64
    }

    pub fn pay_out(&mut self, new_stake: u64, reward_per_share: u128) {
        let pending = self.calculate_pending_reward(reward_per_share) - self.reward_debt;

        self.staked = new_stake;
        self.reward_debt = self.calculate_pending_reward(reward_per_share);
        self.pending_reward += pending;
    }
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Staker {
    pub creation_date: UnixTimestamp,

    pub total_stake: u64,

    pub beneficiary: Beneficiary,

    pub unbonding_start: UnixTimestamp,
    pub unbonding_amount: u64,
}

impl Staker {
    pub fn program_address(
        community: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"staker", &community.to_bytes(), &staker.to_bytes()],
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
    ) -> Result<Staker, ProgramError> {
        Staker::verify_program_address(info.key, community, staker, program_id)?;
        Staker::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::StakerInvalidStakeAccount.into())
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
            unbonding_time: 10 * 3600 * 24,

            reward_per_share: 348923452348342394u128,
            last_reward: 293458234234,
            total_stake: 9821429382935u64,
        };

        let data = v.try_to_vec().unwrap();
        let ret = Settings::try_from_slice(&data).unwrap();

        assert_eq!(v, ret);
    }
}
