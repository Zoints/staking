use solana_program::{clock::UnixTimestamp, pubkey::Pubkey};

pub mod account;
#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;

pub const UNBONDING_PERIOD: UnixTimestamp = 10 * 24 * 60 * 60; // 10 days
pub const ZERO_KEY: Pubkey = Pubkey::new_from_array([0; 32]);

pub const MINIMUM_STAKE: u64 = 1_000;
pub const REWARD_PER_HOUR: u64 = 50_000;

pub const PRECISION: u64 = 1_000_000_000_000;

/// Split Stake
///
/// Divides the staked amount of ZEE into three components
/// for the (staker, primary beneficiary, secondary beneficiary) at the
/// rates of (47.5%, 47.5%, 5%). Remainders go to the staker.
pub fn split_stake(amount: u64) -> (u64, u64, u64) {
    let secondary = amount / 20;
    let primary = (amount - secondary) / 2;
    (amount - primary - secondary, primary, secondary)
}

#[cfg(test)]
mod tests {
    use core::f64;

    use super::*;
    #[test]
    pub fn test_split_stake() {
        assert_eq!(split_stake(1), (1, 0, 0));
        assert_eq!(split_stake(2), (1, 1, 0));
        assert_eq!(split_stake(20), (10, 9, 1));
        assert_eq!(split_stake(100), (48, 47, 5));
        assert_eq!(split_stake(1_000), (475, 475, 50));
    }

    //    #[test]
    // just double-checking to see if a bigger split will
    // always result in a bigger number
    // (it does)
    pub fn _test_split_increase() {
        let mut prev: (u64, u64, u64) = (0, 0, 0);
        for i in 0..1_000_000_000u64 {
            let split = split_stake(i);
            assert!(split.0 >= prev.0);
            assert!(split.1 >= prev.1);
            assert!(split.2 >= prev.2);
            prev = split
        }
    }
    //#[test]
    // reverse of the above
    pub fn _test_split_decrease() {
        let mut prev: (u64, u64, u64) = split_stake(1_000_000_001);
        for i in (0..1_000_000_000u64).rev() {
            let split = split_stake(i);
            assert!(split.0 <= prev.0);
            assert!(split.1 <= prev.1);
            assert!(split.2 <= prev.2);
            prev = split
        }
    }

    // trying to figure out if the u128 datatype is enough for our purposes
    #[test]
    pub fn test_max_rps() {
        let precision: u128 = 1_000_000_000_000_000_000_000_000;
        let mut emission_per_year: u128 = 900_000_000_000;

        let mut reward_per_share_min = 0;
        let mut reward_per_share_max = 0;
        let max_stake = 6_400_000_000_000;
        let min_stake = 1_000;

        // calculate reward per share for 50 years
        for year in 0..50u128 {
            let emission_per_seconds_min =
                precision * emission_per_year / 31_536_000u128 / min_stake;
            let emission_per_seconds_max =
                precision * emission_per_year / 31_536_000u128 / max_stake;

            println!(
                "Year {}: ZEE per year: {}, ZEE per second minimum: {}, ZEE per second maximum: {}",
                year + 1,
                emission_per_year,
                emission_per_seconds_min as f64 / precision as f64,
                emission_per_seconds_max as f64 / precision as f64
            );

            reward_per_share_min += emission_per_seconds_min * 31_536_000u128;
            reward_per_share_max += emission_per_seconds_max * 31_536_000u128;

            emission_per_year = (emission_per_year * 3) / 4; // *.75
        }

        // calculate the worst pending reward. assuming that one person has staked the entire ZEE supply
        // and has been staking for 50 years at a constant year0 emission schedule.
        // 36% of tokens are reserved for staking rewards, so the maximum possible stake is:
        // 6,400,000,000,000
        // (U256::from(self.staked) * reward_per_share_max.0 / U256::from(PRECISION)).as_u64()

        println!(
            "\nreward per share min {}\nreward per share max {}",
            reward_per_share_min as f64 / precision as f64,
            reward_per_share_max as f64 / precision as f64
        );
        let reward_min = min_stake * reward_per_share_min / precision;
        let reward_max = max_stake * reward_per_share_max / precision;

        println!("50 year reward min: {} ZEE", reward_min);
        println!("50 year reward max: {} ZEE", reward_max);
    }
}
