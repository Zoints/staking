use solana_program::pubkey::Pubkey;

pub mod account;
#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;

pub const ZERO_KEY: Pubkey = Pubkey::new_from_array([0; 32]);

pub const MINIMUM_STAKE: u64 = 1_000;
pub const REWARD_PER_YEAR: u128 = 900_000_000_000;
pub const SECONDS_PER_YEAR: u128 = 31_536_000;

pub const PRECISION: u128 = 1_000_000_000_000_000_000_000_000;

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
    pub fn test_rps_calculation() {
        let max_years: u128 = 95;
        let precision: u128 = 1_000_000_000_000_000_000_000_000;
        let mut emission_per_year: u128 = REWARD_PER_YEAR;

        let mut reward_per_share_min = 0;
        let mut reward_per_share_max = 0;
        let max_stake = 6_400_000_000_000; // 100% of supply - 36% of token rewards
        let min_stake = 1;

        // calculate reward per share for x years
        for year in 0..max_years {
            let emission_per_seconds_min =
                precision * emission_per_year / SECONDS_PER_YEAR / min_stake;
            let emission_per_seconds_max =
                precision * emission_per_year / SECONDS_PER_YEAR / max_stake;

            println!(
                "Year {}: ZEE per year: {}, ZEE per second per share minimum: {}, ZEE per second per share maximum: {}",
                year + 1,
                emission_per_year,
                emission_per_seconds_min as f64 / precision as f64,
                emission_per_seconds_max as f64 / precision as f64
            );

            reward_per_share_min += emission_per_seconds_min * SECONDS_PER_YEAR;
            reward_per_share_max += emission_per_seconds_max * SECONDS_PER_YEAR;

            emission_per_year = (emission_per_year * 3) / 4; // *.75
        }

        println!(
            "\nreward per share min {}\nreward per share max {}",
            reward_per_share_min as f64 / precision as f64,
            reward_per_share_max as f64 / precision as f64
        );
        let reward_min = min_stake * reward_per_share_min / precision;
        let reward_max = max_stake * reward_per_share_max / precision;

        println!("{} year reward min: {} ZEE", max_years, reward_min);
        println!("{} year reward max: {} ZEE", max_years, reward_max);
    }
}
