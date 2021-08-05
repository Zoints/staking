use num_derive::FromPrimitive;
use solana_program::decode_error::DecodeError;
use solana_program::msg;
use solana_program::program_error::{PrintProgramError, ProgramError};
use thiserror::Error;

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum StakingError {
    /// Missing Authority Signature
    #[error("Missing Authority Signature")]
    MissingAuthoritySignature,

    /// Program Already Initialized
    #[error("Program Already Initialized")]
    ProgramAlreadyInitialized,

    /// Program Not Initialized
    #[error("Program Not Initialized")]
    ProgramNotInitialized,

    /// Invalid Settings Account
    #[error("Invalid Settings Account")]
    InvalidSettingsAccount,

    /// Invalid Reward Pool Account
    #[error("Invalid Reward Pool Account")]
    InvalidRewardPoolAccount,

    /// Invalid Pool Authority Account
    #[error("Invalid Pool Authority Account")]
    InvalidPoolAuthorityAccount,

    /// Token is not a valid SPL token
    #[error("Token is not a valid SPL token")]
    TokenNotSPLToken,

    /// Community Account Already Exists
    #[error("Community Account Already Exists")]
    CommunityAccountAlreadyExists,

    /// Invalid Stake Account
    #[error("Invalid Stake Account")]
    InvalidStakeAccount,

    /// Invalid Stake Fund Account
    #[error("Invalid Stake Fund Account")]
    InvalidStakeFundAccount,

    /// Invalid Community Account
    #[error("Invalid Community Account")]
    InvalidCommunityAccount,

    /// Missing Stake Signature
    #[error("Missing Stake Signature")]
    MissingStakeSignature,

    /// Associated Invalid Owner
    #[error("Associated Invalid Owner")]
    AssociatedInvalidOwner,

    /// Associated Invalid Token
    #[error("Associated Invalid Token")]
    AssociatedInvalidToken,

    /// Associated Invalid Account
    #[error("Associated Invalid Account")]
    AssociatedInvalidAccount,

    /// Invalid Stake Account
    #[error("Invalid Stake Account")]
    StakerInvalidStakeAccount,

    /// Staker Balance Too Low
    #[error("Staker Balance Too Low")]
    StakerBalanceTooLow,

    /// Staker Minimum Balance Not Met
    #[error("Staker Minimum Balance Not Met")]
    StakerMinimumBalanceNotMet,

    /// Staker Withdrawing Too Much
    #[error("Staker Withdrawing Too Much")]
    StakerWithdrawingTooMuch,

    /// Withdraw Nothing to withdraw
    #[error("Withdraw Nothing to withdraw")]
    WithdrawNothingtowithdraw,

    /// Withdraw Unbonding Time Not Over Yet
    #[error("Withdraw Unbonding Time Not Over Yet")]
    WithdrawUnbondingTimeNotOverYet,

    /// Invalid Beneficiary Account
    #[error("Invalid Beneficiary Account")]
    InvalidBeneficiaryAccount,

    /// Invalid Token
    #[error("Invalid Token")]
    InvalidToken,
}

impl From<StakingError> for ProgramError {
    fn from(e: StakingError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
impl<T> DecodeError<T> for StakingError {
    fn type_of() -> &'static str {
        "StakingError"
    }
}

impl PrintProgramError for StakingError {
    fn print<E>(&self) {
        msg!("STAKING-ERROR: {}", &self.to_string());
    }
}
