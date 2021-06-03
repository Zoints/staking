use account::StakePayout;
use solana_program::{clock::UnixTimestamp, pubkey::Pubkey};

pub mod account;
#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;

pub const UNBONDING_PERIOD: UnixTimestamp = 10 * 24 * 60 * 60; // 10 days
pub const SPONSOR_UNLOCK: UnixTimestamp = 48 * 60 * 60; // 2 days
pub const ZERO_KEY: Pubkey = Pubkey::new_from_array([0; 32]);

pub const MINIMUM_STAKE: u64 = 1_000;
pub const STAKE_APY: u64 = 10; // this is 100 / <desired percentage>
pub const SECONDS_PER_YEAR: u64 = 365 * 24 * 3600;

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

/// Calculate Payout
///
/// Calculate the amount of yield during the given period for a certain stake
pub fn calculate_payout(start: UnixTimestamp, end: UnixTimestamp, stake: u64) -> StakePayout {
    let seconds = (end - start) as u64;

    let mut payout = StakePayout::new(stake);
    payout /= STAKE_APY;
    payout /= SECONDS_PER_YEAR;
    payout *= seconds;
    payout
}

#[cfg(test)]
mod tests {
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
}
