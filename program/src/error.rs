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

    /// Invalid Pool Account
    #[error("Invalid Pool Account")]
    InvalidPoolAccount,

    /// Token is not a valid SPL token
    #[error("Token is not a valid SPL token")]
    TokenNotSPLToken,

    /// Community Account Already Exists
    #[error("Community Account Already Exists")]
    CommunityAccountAlreadyExists,

    /// Primary Associated Invalid Account
    #[error("Primary Associated Invalid Account")]
    PrimaryAssociatedInvalidAccount,

    /// Primary Associated Invalid Owner
    #[error("Primary Associated Invalid Owner")]
    PrimaryAssociatedInvalidOwner,

    /// Primary Associated Invalid Token
    #[error("Primary Associated Invalid Token")]
    PrimaryAssociatedInvalidToken,

    /// Secondary Associated Invalid Owner
    #[error("Secondary Associated Invalid Owner")]
    SecondaryAssociatedInvalidOwner,

    /// Secondary Associated Invalid Token
    #[error("Secondary Associated Invalid Token")]
    SecondaryAssociatedInvalidToken,

    /// Secondary Associated Invalid Account
    #[error("Secondary Associated Invalid Account")]
    SecondaryAssociatedInvalidAccount,

    /// Community Creator Signature Missing
    #[error("Community Creator Signature Missing")]
    CommunityCreatorSignatureMissing,

    /// Invalid Stake Account
    #[error("Invalid Stake Account")]
    InvalidStakeAccount,

    /// Invalid Community Account
    #[error("Invalid Community Account")]
    InvalidCommunityAccount,

    /// Missing Stake Signature
    #[error("Missing Stake Signature")]
    MissingStakeSignature,

    /// Staker Associated Invalid Owner
    #[error("Staker Associated Invalid Owner")]
    StakerAssociatedInvalidOwner,

    /// Staker Associated Invalid Token
    #[error("Staker Associated Invalid Token")]
    StakerAssociatedInvalidToken,

    /// Staker Associated Invalid Account
    #[error("Staker Associated Invalid Account")]
    StakerAssociatedInvalidAccount,

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

    /// placeholder
    #[error("placeholder")]
    Placeholder,
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
