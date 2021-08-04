use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::account_info::AccountInfo;
use solana_program::clock::UnixTimestamp;

use solana_program::msg;
use solana_program::{program_error::ProgramError, pubkey::Pubkey};

use crate::error::StakingError;
use crate::ZERO_KEY;
use crate::{PRECISION, SECONDS_PER_YEAR};

/// Account to hold global variables commonly used by instructions
#[repr(C)]
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Settings {
    /// SPL Token Mint accepted by instructions ("ZEE")
    pub token: Pubkey,
    /// Time (in seconds) that funds are locked after unstaking
    pub unbonding_duration: u64,
    /// The Beneficiary that receives 5% of all yield
    pub fee_recipient: Pubkey,

    /// The time at which emissions is reduced by 25%
    pub next_emission_change: UnixTimestamp,
    /// Amount of ZEE paid out during the current period
    pub emission: u64,

    // tokenomics variables
    // for a more detailed explanation of the algorithm and variables
    // see https://www.mathcha.io/editor/j4V1YiODsYQu8dee0NiO39Z05cePQvk0f9qPex6
    /// Total amount of ZEE staked
    pub total_stake: u64,
    /// The yield for every 1 ZEE staked, multiplied by PRECISION
    pub reward_per_share: u128,
    /// Last time the pool reward was updated
    pub last_reward: UnixTimestamp,
}

impl Settings {
    /// PDA of the settings account
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"settings"], program_id)
    }

    /// Verify if an address matches the settings PDA
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidSettingsAccount.into()),
        }
    }

    /// Decode the Settings account from `AccountInfo`.
    /// Verifies the address before deserializing the data.
    pub fn from_account_info(
        info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Settings, ProgramError> {
        Self::verify_program_address(info.key, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::ProgramNotInitialized.into())
    }

    /// Update the Reward per Share variable
    ///
    /// The basic formula is:
    ///   `reward per share += <time elapsed> * <emissions during that period> / <total amount staked>`
    ///
    /// Emissions are automatically reduced by 25% every year
    pub fn update_rewards(&mut self, now: UnixTimestamp) {
        if now <= self.last_reward {
            return;
        }

        if self.total_stake > 0 {
            let mut reward = 0;

            // emissions reduce by 25% every year, so if the period between `last_reward`
            // and `now` crosses the year threshold, we calculate the period in each year
            // separately
            // the math works across multiple year gaps though in production this would
            // never occur
            while now >= self.next_emission_change {
                let seconds = (self.next_emission_change - self.last_reward) as u128;
                reward += (PRECISION * self.emission as u128
                    / SECONDS_PER_YEAR
                    / self.total_stake as u128)
                    * seconds;
                self.last_reward = self.next_emission_change;
                self.next_emission_change += SECONDS_PER_YEAR as i64;
                self.emission = (self.emission as u128 * 3 / 4) as u64; // 75%
            }

            let seconds = (now - self.last_reward) as u128;
            reward +=
                (PRECISION * self.emission as u128 / SECONDS_PER_YEAR / self.total_stake as u128)
                    * seconds;

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

/// The PDA that owns the pool associated accounts
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

/// The reward fund is the token account that pays out yield.
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

/// A Community is a the entity that someone can stake against to share yield.
/// Each community has an authority, which is the solana address in charge of making
/// decisions about the Community itself, once that functionality is implemented.
/// The Primary beneficiary receives 45% of the staker's yield, the secondary beneficiary
/// receives 5% of the staker's yield.
///
/// It is possible for a Community to have no secondary Beneficiary, in which case the
/// the 5% stay in the reward pool.
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Community {
    /// The time the community was initialized
    pub creation_date: UnixTimestamp,
    /// The Community's authority
    pub authority: Pubkey,
    /// The primary beneficiary receiving 45% of yield
    pub primary: Pubkey,
    /// The secondary beneficiary receiving 5% of yield
    pub secondary: Pubkey,
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

/// A Beneficiary receives yield based on the amount of ZEE staked.
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Beneficiary {
    /// The address who is allowed to harvest the yield
    pub authority: Pubkey,

    /// The amount of ZEE staked for the beneficiary
    pub staked: u64,
    /// Helper variable. For more information see https://www.mathcha.io/editor/j4V1YiODsYQu8dee0NiO39Z05cePQvk0f9qPex6
    pub reward_debt: u64,
    /// Helper variable. The amount of ZEE that has been paid out theoretically but not transferred to the user's wallet
    /// due to technical limitations.
    pub pending_reward: u64,
}

impl Beneficiary {
    pub fn program_address(authority: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"beneficiary", authority.as_ref()], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        authority: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(authority, program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidBeneficiaryAccount.into()),
        }
    }

    pub fn from_account_info(
        info: &AccountInfo,
        authority: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<Beneficiary, ProgramError> {
        Self::verify_program_address(info.key, authority, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::InvalidBeneficiaryAccount.into())
    }

    /// True if there is no authority
    pub fn is_empty(&self) -> bool {
        self.authority == ZERO_KEY
    }

    /// The total amount of theoretical ZEE owed if the amount staked had been staked
    /// since the beginning of time.
    pub fn calculate_pending_reward(&self, reward_per_share: u128) -> u64 {
        (self.staked as u128 * reward_per_share / PRECISION) as u64
    }

    /// Update the pending reward when the amount staked changes.
    pub fn pay_out(&mut self, new_stake: u64, reward_per_share: u128) {
        let pending = self.calculate_pending_reward(reward_per_share) - self.reward_debt;

        self.staked = new_stake;
        self.reward_debt = self.calculate_pending_reward(reward_per_share);
        self.pending_reward += pending;
    }
}

/// The account that initiated a stake
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Stake {
    /// Time the account was initiated
    pub creation_date: UnixTimestamp,

    /// The total amount currently staked before splitting it up to beneficiaries.
    pub total_stake: u64,

    /// The staker's address
    pub staker: Pubkey,

    /// The most recent time an amount was unstaked
    pub unbonding_start: UnixTimestamp,
    /// The total amount of pending funds
    pub unbonding_amount: u64,
}

impl Stake {
    pub fn fund_address(community: &Pubkey, staker: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"staker fund", &community.to_bytes(), &staker.to_bytes()],
            program_id,
        )
    }
    pub fn verify_fund_address(
        address: &Pubkey,
        community: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::fund_address(community, staker, program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidStakeFundAccount.into()),
        }
    }

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
    ) -> Result<Stake, ProgramError> {
        Self::verify_program_address(info.key, community, staker, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::StakerInvalidStakeAccount.into())
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::BASE_REWARD;

    #[test]
    pub fn test_settings_serialization() {
        let v = Settings {
            token: Pubkey::new_unique(),
            unbonding_duration: 10 * 3600 * 24,
            fee_recipient: Pubkey::new_unique(),
            next_emission_change: 98123798352345,
            emission: 23458972935823,

            reward_per_share: 348923452348342394u128,
            last_reward: 293458234234,
            total_stake: 9821429382935u64,
        };

        let data = v.try_to_vec().unwrap();
        let ret = Settings::try_from_slice(&data).unwrap();

        assert_eq!(v, ret);
    }

    #[test]
    pub fn test_settings_update_rewards() {
        let base = Settings {
            token: Pubkey::new_unique(),
            unbonding_duration: 0,
            fee_recipient: Pubkey::new_unique(),

            next_emission_change: SECONDS_PER_YEAR as i64,
            emission: BASE_REWARD as u64,

            reward_per_share: 0,
            last_reward: 0,
            total_stake: 1, // makes math easier,
        };

        let mut previous: Vec<Settings> = vec![];
        let breakpoints: Vec<(u128, u128)> = vec![
            (0, 0),
            (1, PRECISION * BASE_REWARD / SECONDS_PER_YEAR), // one second
            (86400, PRECISION * BASE_REWARD / SECONDS_PER_YEAR * 86400), // one day
            (
                SECONDS_PER_YEAR - 1,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * (SECONDS_PER_YEAR - 1),
            ),
            (
                SECONDS_PER_YEAR,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR + 1,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4) / SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR + 2,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4) / SECONDS_PER_YEAR * 2,
            ),
            (
                SECONDS_PER_YEAR * 2,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4) / SECONDS_PER_YEAR * SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR * 3,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4) / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4 * 3 / 4) / SECONDS_PER_YEAR
                        * SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR * 3 + 1,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4) / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4 * 3 / 4) / SECONDS_PER_YEAR
                        * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 3 / 4 * 3 / 4 * 3 / 4) / SECONDS_PER_YEAR,
            ),
        ];

        for (secs, rps) in breakpoints {
            let mut settings = base.clone();

            settings.update_rewards(secs as i64);
            assert_eq!(rps, settings.reward_per_share);

            previous.iter_mut().all(|prev| {
                prev.update_rewards(secs as i64);
                prev.reward_per_share == rps
            });

            previous.push(settings);
        }
    }
}
