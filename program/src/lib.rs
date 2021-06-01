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
    use super::*;
    #[test]
    pub fn test_split_stake() {
        assert_eq!(split_stake(1), (1, 0, 0));
        assert_eq!(split_stake(2), (1, 1, 0));
        assert_eq!(split_stake(20), (10, 9, 1));
        assert_eq!(split_stake(100), (48, 47, 5));
        assert_eq!(split_stake(1_000), (475, 475, 50));
    }
}
