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

        let old_last_reward = self.last_reward;
        let old_rps = self.reward_per_share;

        if self.total_stake > 0 {
            let mut reward = 0;

            // emissions reduce by 25% every year, so if the period between `last_reward`
            // and `now` crosses the year threshold, we calculate the period in each year
            // separately
            // the math works across multiple year gaps though in production this would
            // never occur
            while now >= self.next_emission_change {
                let seconds = (self
                    .next_emission_change
                    .checked_sub(self.last_reward)
                    .unwrap()) as u128;
                reward += PRECISION
                    .checked_mul(self.emission as u128)
                    .unwrap()
                    .checked_div(SECONDS_PER_YEAR)
                    .unwrap()
                    .checked_div(self.total_stake as u128)
                    .unwrap()
                    .checked_mul(seconds)
                    .unwrap();

                self.last_reward = self.next_emission_change;
                self.next_emission_change += SECONDS_PER_YEAR as i64;
                self.emission = (self.emission as u128 * 3 / 4) as u64; // 75%
            }

            let seconds = (now - self.last_reward) as u128;
            reward += PRECISION
                .checked_mul(self.emission as u128)
                .unwrap()
                .checked_div(SECONDS_PER_YEAR)
                .unwrap()
                .checked_div(self.total_stake as u128)
                .unwrap()
                .checked_mul(seconds)
                .unwrap();

            self.reward_per_share += reward;
        }
        self.last_reward = now;

        msg!(
            "updated pool rewards: from {} to {} ({}), old rps = {}, new rps = {}, stake = {}",
            old_last_reward,
            self.last_reward,
            self.last_reward - old_last_reward,
            old_rps,
            self.reward_per_share,
            self.total_stake
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
    pub holding: u64,
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
    pub fn calculate_holding(&self, reward_per_share: u128) -> u64 {
        (self.staked as u128)
            .checked_mul(reward_per_share)
            .unwrap()
            .checked_div(PRECISION)
            .unwrap() as u64
    }

    /// Update the pending reward when the amount staked changes.
    pub fn pay_out(&mut self, new_stake: u64, reward_per_share: u128) {
        let pending = self.calculate_holding(reward_per_share) - self.reward_debt;

        self.staked = new_stake;
        self.reward_debt = self.calculate_holding(reward_per_share);
        self.holding += pending;
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
    pub unbonding_end: UnixTimestamp,
    /// The total amount of pending funds
    pub unbonding_amount: u64,
}

impl Stake {
    pub fn fund_address(community: &Pubkey, staker: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"stake fund", &community.to_bytes(), &staker.to_bytes()],
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
                PRECISION
                    .checked_mul(BASE_REWARD)
                    .unwrap()
                    .checked_div(SECONDS_PER_YEAR)
                    .unwrap()
                    .checked_mul(SECONDS_PER_YEAR)
                    .unwrap()
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

    #[test]
    pub fn test_deserialize_empty() {
        let data = [0; 56];
        let beneficiary: Beneficiary = Beneficiary::try_from_slice(&data).unwrap();
        assert_eq!(beneficiary.authority, Pubkey::default());
        assert_eq!(beneficiary.staked, 0);
        assert_eq!(beneficiary.reward_debt, 0);
        assert_eq!(beneficiary.holding, 0);
    }

    #[test]
    pub fn test_audit_beneficiary() {
        let bene = Beneficiary {
            authority: Pubkey::new_unique(),
            staked: 450100175u64,
            reward_debt: 180637733882444u64,
            holding: 1621703692,
        };

        let rps = 1156062048806495040690850880650u128;

        println!("{}", bene.calculate_holding(rps) - bene.reward_debt);
    }

    #[test]
    pub fn test_math() {
        let mut settings = Settings {
            token: Pubkey::new_unique(),
            unbonding_duration: 600,
            fee_recipient: Pubkey::new_unique(),
            emission: BASE_REWARD as u64,
            total_stake: 0,
            reward_per_share: 0,
            last_reward: 1628161961,
            next_emission_change: 1628161961 + SECONDS_PER_YEAR as i64,
        };

        let updates: Vec<(i64, i64)> = vec![
            (1628162863, 1000),
            (1628163171, -1000),
            (1628163217, 1000),
            (1628163242, 1000),
            (1628163621, 0),
            (1628172724, 1000),
            (1628262206, 100000),
            (1628262876, 1000),
            (1628370948, 1000),
            (1628370998, 1000),
            (1628371018, 1000),
            (1628371034, 1000),
            (1628371058, 1000),
            (1628371341, -1000),
            (1628371437, 0),
            (1628371474, 0),
            (1628371491, 0),
            (1628371738, 10000),
            (1628512416, 100000),
            (1628512447, 100000),
            (1628513618, 1000),
            (1628513640, -1000),
            (1628513650, 0),
            (1628513659, 0),
            (1628514456, 1000),
            (1628514462, 0),
            (1628514472, 1000),
            (1628514481, -1000),
            (1628514770, 1000),
            (1628514796, 1000),
            (1628514815, 1000),
            (1628515548, -1000),
            (1628528198, 0),
            (1628578726, 0),
            (1628592024, 1000),
            (1628597662, 1000),
            (1628597738, 1000),
            (1628597771, -1000),
            (1628605513, 1000),
            (1628615598, 100000),
            (1628616352, 100000),
            (1628642458, 0),
            (1628686317, -1000),
            (1628694672, 1000),
            (1628694728, 100000),
            (1628696878, 0),
            (1628696886, 0),
            (1628696898, 0),
            (1628696917, 1000),
            (1628696927, 1000),
            (1628696971, 1000),
            (1628697000, 1000),
            (1628698834, 100000),
            (1628700041, 1000),
            (1628700213, -1000),
            (1628742269, 100000),
            (1628786374, 1000),
            (1628786395, -1000),
            (1628786438, 2000),
            (1628786450, -1000),
            (1628786767, 1000),
            (1628786780, 2000),
            (1628800111, 0),
            (1628872184, 10000),
            (1628872212, 10000),
            (1629046399, 0),
            (1629203953, 100000),
            (1629204189, -100000),
            (1629204758, 100000),
            (1629204774, -100000),
            (1629206432, 100000),
            (1629206445, -100000),
            (1629295380, 50000),
            (1629298257, 0),
            (1629307442, 10000),
            (1629307509, 10000),
            (1629330543, 0),
            (1629461116, 10000),
            (1629461184, -30000),
            (1629479595, 0),
            (1629479609, 0),
            (1629479629, 0),
            (1629479640, 0),
            (1629479649, 0),
            (1629479656, 0),
            (1629479707, 0),
            (1629479719, 0),
            (1629479729, 0),
            (1629479739, 0),
            (1629479746, 0),
            (1629479752, 0),
            (1629479839, 0),
            (1629479850, 0),
            (1629479856, 0),
            (1629480142, 1000),
            (1629480210, -6000),
            (1629480936, -50000),
            (1629487012, 50000),
            (1629487027, -50000),
            (1629490672, 50000),
            (1629490805, -50000),
            (1629501803, 100000),
            (1629779318, 100000),
            (1629826739, 100000),
            (1629827061, 100000),
            (1629870455, 100000),
            (1629870835, 25000),
            (1629870924, 0),
            (1629899713, 1000),
            (1629899892, 1000),
            (1629934333, 0),
            (1629934537, 0),
            (1629934600, 0),
            (1629934632, 0),
            (1629934653, 0),
            (1629934678, 0),
            (1629934701, 0),
            (1629934913, 0),
            (1629934919, 0),
            (1629934961, 0),
            (1629936032, 0),
            (1630080970, 100000),
            (1630081683, 100000),
            (1630082930, 100000),
            (1630369651, -500000),
            (1630497412, 1000),
            (1630497672, 1000),
            (1630497769, 1000),
            (1630498872, 1000),
            (1630498895, 1000),
            (1630551792, 100000),
            (1630552130, 42069),
            (1630582408, 1000),
            (1630584900, 1000),
            (1630611542, 0),
            (1631023291, 0),
            (1631023323, 0),
            (1631023359, -1000),
            (1631023371, 0),
            (1631037096, 0),
            (1631037116, 0),
            (1631037142, 0),
            (1631099064, 100000),
            (1631113265, 1000),
            (1631113323, -1000),
            (1631124950, 100000),
            (1631131343, 100000),
            (1631164092, 0),
            (1631164105, 0),
            (1631164113, 0),
            (1631164132, 0),
            (1631198461, 10000),
            (1631200472, 30000),
            (1631204837, 1000),
            (1631339534, 1000),
            (1631341729, 25000),
            (1631341810, -25000),
            (1631380472, 0),
            (1631512115, 0),
            (1631546895, 25000),
            (1631546946, -25000),
            (1631546964, 25000),
            (1631547097, -25000),
            (1631547134, 25000),
            (1631821498, 0),
            (1631822971, 0),
            (1631822990, 0),
            (1631823068, 0),
            (1631823515, 10000),
            (1631823540, 10000),
            (1631828183, 1000),
            (1631911471, 0),
            (1631916130, -20000),
            (1631923412, 1000),
            (1631924318, 1000),
            (1631924461, 100000),
            (1631924496, 1000),
            (1631924524, -1000),
            (1631924527, 1000),
            (1631925187, 0),
            (1631925298, 1000),
            (1631925391, 0),
            (1631926249, 0),
            (1632090742, 0),
            (1632151297, 0),
            (1632152042, 100000),
            (1632152208, 100000),
            (1632155743, 0),
            (1632157997, 1000000),
            (1632161521, 1000),
            (1632163391, 0),
            (1632163452, 10000000),
            (1632163475, 100000),
            (1632165660, 0),
            (1632174673, 0),
            (1632174834, 0),
            (1632180256, 0),
            (1632181560, -25000),
            (1632182370, 25000),
            (1632182414, 0),
            (1632201471, -1000),
            (1632201500, -30000),
            (1632201557, -10000),
            (1632230791, -25000),
            (1632240284, -1000),
            (1632240974, 1000),
            (1632283954, 0),
            (1632283968, 0),
            (1632283992, 0),
            (1632308643, 0),
            (1632308697, 0),
            (1632325889, 0),
            (1632325909, 0),
            (1632335873, 0),
            (1632339166, 0),
            (1632350763, 0),
            (1632362425, 1000),
            (1632400008, 10000),
            (1632404023, 0),
            (1632404405, 0),
            (1632410656, 0),
            (1632410748, 0),
            (1632428540, 1000),
            (1632430990, 1000),
            (1632432451, 5000),
            (1632454001, 50000),
            (1632455993, 100000),
            (1632456041, 0),
            (1632456059, 0),
            (1632459897, 5000),
            (1632484501, 0),
            (1632499557, 25000),
            (1632505624, 5000),
            (1632508145, 0),
            (1632508173, 0),
            (1632510165, 1420),
            (1632513317, 1000),
            (1632513323, 1000),
            (1632513953, 6969),
            (1632516907, 5000),
            (1632516967, 5000),
            (1632517227, 1000),
            (1632517919, 0),
            (1632520593, 5000),
            (1632520667, 100000),
            (1632524259, 5000),
            (1632524382, 1000),
            (1632524571, 100000),
            (1632526717, 0),
            (1632527190, 1069),
            (1632533219, 5000),
            (1632542733, 1000),
            (1632545416, 5000),
            (1632565748, 1000),
            (1632565822, 0),
            (1632584502, 1000),
            (1632584881, 0),
            (1632677155, 5000),
            (1632677166, 0),
            (1632708987, 5000),
            (1632713753, 1000),
            (1632731042, 100000),
            (1632735904, 500000),
            (1632735989, 5000),
            (1632746116, 0),
            (1632746319, 100000),
            (1632748757, 25000),
            (1632755978, 1000000),
            (1632755998, 0),
            (1632762690, 100000),
            (1632763728, 900000),
            (1632773232, 42069),
            (1632773581, 5000),
            (1632775344, 0),
            (1632775501, 5000),
            (1632784016, -25000),
            (1632785340, 25000),
            (1632789328, 0),
            (1632789489, 10000000),
            (1632789515, 15000000),
            (1632790883, 5000),
            (1632791774, 5000),
            (1632800048, 0),
            (1632800060, 0),
            (1632800118, 11000000),
            (1632800157, 23000000),
            (1632800219, 40000000),
            (1632810389, 0),
            (1632810893, 5000),
            (1632811001, 0),
            (1632835039, 0),
            (1632835082, 399999000),
            (1632837785, 0),
            (1632841942, 1000),
            (1632842329, 5000),
            (1632867891, 5000),
            (1632867951, 1000),
            (1632868010, 5000),
            (1632868034, 11111),
            (1632868070, 5000),
            (1632868113, 5000),
            (1632868167, 5000),
            (1632868212, 5000),
            (1632870625, 0),
            (1632872702, 2000),
            (1632891144, 0),
            (1632894778, 0),
            (1632895612, 5000),
            (1632898414, 1000),
            (1632943900, 1000),
            (1632943977, 1000),
            (1632946741, 5000),
            (1632946827, 5000),
            (1632946904, 5000),
            (1632946967, 1000000),
            (1632947090, 0),
            (1632947176, 1069),
            (1632947424, 5000),
            (1632947499, 1000),
            (1632947624, 0),
            (1632947628, 10000),
            (1632947667, 500000000),
            (1632947769, 0),
            (1632947801, 0),
            (1632947829, 0),
            (1632947846, 0),
            (1632948257, 0),
            (1632948278, 0),
            (1632948287, 0),
            (1632981415, 100000),
            (1632981559, 100000),
            (1632981580, 25000),
            (1632981994, 99997500),
            (1632982918, 0),
            (1632983675, 900000000),
            (1632983715, 0),
            (1633014105, 0),
            (1633016172, 0),
            (1633018082, 0),
            (1633025003, 0),
            (1633026007, 0),
            (1633042295, -25000),
            (1633042346, -5000),
            (1633043177, 100000),
            (1633057719, -2000),
            (1633078414, 5000),
            (1633103572, 5000),
            (1633103637, 5000),
            (1633103912, 50000),
            (1633103965, 50000),
            (1633131060, 0),
            (1633131312, 0),
            (1633131346, 0),
            (1633151808, 0),
            (1633151853, 0),
            (1633151962, 0),
            (1633152056, 0),
            (1633152098, 0),
            (1633152161, 0),
            (1633152242, 0),
            (1633152302, 0),
            (1633152419, 0),
            (1633152490, 0),
            (1633152525, 0),
            (1633157417, 0),
            (1633197316, 0),
            (1633210056, 0),
            (1633221988, 5000),
            (1633237239, 50000),
            (1633237345, 5000),
            (1633238322, 10000000),
            (1633238681, 0),
            (1633238714, 0),
            (1633238764, 0),
            (1633243923, 0),
            (1633245491, 0),
            (1633250119, 0),
            (1633250147, 0),
            (1633250246, 0),
            (1633292992, 0),
        ];

        for (k, v) in updates {
            println!(
                "old rps = {}, old last_reward = {}, old stake = {}",
                settings.reward_per_share, settings.last_reward, settings.total_stake
            );
            settings.update_rewards(k);
            if v < 0 {
                settings.total_stake -= (v.abs()) as u64;
            } else {
                settings.total_stake += v as u64;
            }
            println!(
                "new rps = {}, new last_reward = {}, new stake = {}",
                settings.reward_per_share, settings.last_reward, settings.total_stake
            );
            println!("==");
        }

        println!("done");
        assert!(1 == 0);
    }
}
