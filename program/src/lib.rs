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
