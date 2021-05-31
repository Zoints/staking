use num_derive::FromPrimitive;
use solana_program::decode_error::DecodeError;
use solana_program::msg;
use solana_program::program_error::{PrintProgramError, ProgramError};
use thiserror::Error;

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum StakingError {
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
