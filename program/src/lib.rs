use solana_program::pubkey::Pubkey;

pub mod account;
#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;

pub const ZERO_KEY: Pubkey = Pubkey::new_from_array([0; 32]);

/// The minimum amount of ZEE a staker needs to stake.
/// It is not allowed to withdraw to an amount below the minimum,
/// unless they withdraw their entire balance.
pub const MINIMUM_STAKE: u64 = 1_000;
/// The amount of ZEE per year that are distributed as yield.
/// The initial value of the emission system.
pub const BASE_REWARD: u128 = 900_000_000_000;
/// Helper constant
pub const SECONDS_PER_YEAR: u128 = 31_536_000;
/// Internally all yield calculations are done in integers to avoid
/// floating point math. The precision is an arbitrary factor contained in
/// the calculations to determine the number of significant post-decimal
/// digits.
pub const PRECISION: u128 = 1_000_000_000_000_000_000_000_000;

/// Split Stake
///
/// Divides the staked amount of ZEE into four components
/// for the (staker, owner, referrer, fee) at the
/// rates of (45%, 45%, 5%, 5%). Remainders go to the staker.
pub fn split_stake(amount: u64) -> (u64, u64, u64, u64) {
    let ten_percent = amount / 10;
    let five_percent = ten_percent / 2;
    let remainder = ten_percent - five_percent - five_percent;

    let rest = amount - ten_percent;
    let major = rest / 2;
    (rest - major, major, five_percent + remainder, five_percent)
}

#[cfg(test)]
mod tests {
    use core::f64;

    use super::*;
    #[test]
    pub fn test_split_stake() {
        assert_eq!(split_stake(1), (1, 0, 0, 0));
        assert_eq!(split_stake(2), (1, 1, 0, 0));
        assert_eq!(split_stake(20), (9, 9, 1, 1));
        assert_eq!(split_stake(21), (10, 9, 1, 1));
        assert_eq!(split_stake(22), (10, 10, 1, 1));
        assert_eq!(split_stake(98), (45, 44, 5, 4));
        assert_eq!(split_stake(99), (45, 45, 5, 4));
        assert_eq!(split_stake(100), (45, 45, 5, 5));
        assert_eq!(split_stake(1_000), (450, 450, 50, 50));

        for i in 0..=1_000 {
            let split = split_stake(i);
            assert_eq!(split.0 + split.1 + split.2 + split.3, i);
        }
    }

    //#[test]
    // just double-checking to see if a bigger split will
    // always result in a bigger number
    // (it does)
    pub fn _test_split_increase() {
        let mut prev: (u64, u64, u64, u64) = (0, 0, 0, 0);
        for i in 0..1_000_000_000u64 {
            let split = split_stake(i);
            //println!("{:?}", split);
            assert!(split.0 >= prev.0);
            assert!(split.1 >= prev.1);
            assert!(split.2 >= prev.2);
            assert!(split.3 >= prev.3);
            prev = split
        }
    }
    //#[test]
    // reverse of the above
    pub fn _test_split_decrease() {
        let mut prev: (u64, u64, u64, u64) = split_stake(1_000_000_001);
        for i in (0..1_000_000_000u64).rev() {
            let split = split_stake(i);
            assert!(split.0 <= prev.0);
            assert!(split.1 <= prev.1);
            assert!(split.2 <= prev.2);
            assert!(split.3 <= prev.3);
            prev = split
        }
    }

    // trying to figure out if the u128 datatype is enough for our purposes
    #[test]
    pub fn test_rps_calculation() {
        let max_years: u128 = 95;
        let mut emission_per_year: u128 = BASE_REWARD;

        let mut reward_per_share_min = 0;
        let mut reward_per_share_max = 0;
        let max_stake = 6_400_000_000_000; // 100% of supply - 36% of token rewards
        let min_stake = 1;

        // calculate reward per share for x years
        for year in 0..max_years {
            let emission_per_seconds_min =
                PRECISION * emission_per_year / SECONDS_PER_YEAR / min_stake;
            let emission_per_seconds_max =
                PRECISION * emission_per_year / SECONDS_PER_YEAR / max_stake;

            println!(
                "Year {}: ZEE per year: {}, ZEE per second per share minimum: {}, ZEE per second per share maximum: {}",
                year + 1,
                emission_per_year,
                emission_per_seconds_min as f64 / PRECISION as f64,
                emission_per_seconds_max as f64 / PRECISION as f64
            );

            reward_per_share_min += emission_per_seconds_min * SECONDS_PER_YEAR;
            reward_per_share_max += emission_per_seconds_max * SECONDS_PER_YEAR;

            emission_per_year = (emission_per_year * 3) / 4; // *.75
        }

        println!(
            "\nreward per share min {}\nreward per share max {}",
            reward_per_share_min as f64 / PRECISION as f64,
            reward_per_share_max as f64 / PRECISION as f64
        );
        let reward_min = min_stake * reward_per_share_min / PRECISION;
        let reward_max = max_stake * reward_per_share_max / PRECISION;

        println!("{} year reward min: {} ZEE", max_years, reward_min);
        println!("{} year reward max: {} ZEE", max_years, reward_max);
    }
}
