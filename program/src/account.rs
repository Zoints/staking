use borsh::{BorshDeserialize, BorshSchema, BorshSerialize};
use solana_program::account_info::AccountInfo;
use solana_program::clock::UnixTimestamp;

use solana_program::{program_error::ProgramError, pubkey::Pubkey};

use crate::error::StakingError;
use crate::split_stake;

#[repr(C)]
#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Settings {
    pub token: Pubkey,
    pub authority: Pubkey,
    pub sponsor_fee: u64,
    pub total_stake: u64,
}

impl Settings {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"settings"], program_id)
    }

    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidSettingsAccount.into()),
        }
    }

    pub fn from_account_info(
        info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Settings, ProgramError> {
        Self::verify_program_address(info.key, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::ProgramNotInitialized.into())
    }
}

/// Transfer ZEE from Pool
///
/// The recipient has to be verified to be ZEE before this is used.
#[macro_export]
macro_rules! pool_transfer {
    ($pool:expr, $recipient:expr, $program:expr, $amount:expr) => {
        match Pool::verify_program_address($pool.key, $program) {
            Ok(seed) => invoke_signed(
                &spl_token::instruction::transfer(
                    &spl_token::id(),
                    $pool.key,
                    $recipient.key,
                    $program,
                    &[],
                    $amount,
                )?,
                &[$pool.clone(), $recipient.clone()],
                &[&[b"pool", &[seed]]],
            ),
            Err(err) => Err(err),
        }
    };
}

#[macro_export]
macro_rules! verify_associated {
    ($assoc:expr, $token:expr, $owner:expr) => {
        match Account::unpack(&$assoc.data.borrow()) {
            Ok(account) => {
                if account.mint != $token {
                    Err(StakingError::AssociatedInvalidToken.into())
                } else if account.owner != $owner {
                    Err(StakingError::AssociatedInvalidOwner.into())
                } else {
                    Ok(account)
                }
            }
            _ => Err(StakingError::AssociatedInvalidAccount),
        }
    };
}

#[derive(Debug, PartialEq, Clone, Copy, Eq)]
pub struct Pool {}
impl Pool {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"pool"], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidPoolAccount.into()),
        }
    }
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Community {
    pub creation_date: UnixTimestamp,
    pub last_action: UnixTimestamp,
    pub authority: Pubkey,
    pub primary: Beneficiary,
    pub secondary: Beneficiary,
    pub referrer: Pubkey,
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Beneficiary {
    pub staked: u64,
    pub authority: Pubkey,
    pub address: Pubkey,
    pub unclaimed: StakePayout,
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

    pub fn update_payout(&mut self, current_time: UnixTimestamp) {
        if self.last_action == current_time {
            return;
        }

        let primary_payout =
            crate::calculate_payout(self.last_action, current_time, self.primary.staked);
        self.primary.unclaimed.add(primary_payout);

        let secondary_payout =
            crate::calculate_payout(self.last_action, current_time, self.secondary.staked);
        self.secondary.unclaimed.add(secondary_payout);

        self.last_action = current_time;
    }
}

#[derive(Debug, PartialEq, BorshDeserialize, BorshSchema, BorshSerialize, Clone, Copy, Eq)]
pub struct Stake {
    pub creation_date: UnixTimestamp,
    pub total_stake: u64,
    pub self_stake: u64,
    pub primary_stake: u64,
    pub secondary_stake: u64,
    pub last_action: UnixTimestamp,
    pub unclaimed: StakePayout,
    pub unbonding_start: UnixTimestamp,
    pub unbonding_amount: u64,
}

impl Stake {
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
        Stake::verify_program_address(info.key, community, staker, program_id)?;
        Stake::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::StakerInvalidStakeAccount.into())
    }

    pub fn add_stake(&mut self, amount: u64) -> (u64, u64) {
        self.total_stake += amount;
        let split = split_stake(self.total_stake);
        // a bigger split is always >=, this difference should be safe
        let d_primary = split.1 - self.primary_stake;
        let d_secondary = split.2 - self.secondary_stake;
        self.self_stake = split.0;
        self.primary_stake = split.1;
        self.secondary_stake = split.2;
        (d_primary, d_secondary)
    }

    pub fn remove_stake(&mut self, amount: u64) -> (u64, u64) {
        self.total_stake -= amount;
        let split = split_stake(self.total_stake);
        // a smaller split is always <=, this difference should be safe
        let d_primary = self.primary_stake - split.1;
        let d_secondary = self.secondary_stake - split.2;
        self.self_stake = split.0;
        self.primary_stake = split.1;
        self.secondary_stake = split.2;
        (d_primary, d_secondary)
    }
}

#[repr(C)]
#[derive(
    Clone,
    Debug,
    PartialEq,
    BorshSerialize,
    BorshDeserialize,
    BorshSchema,
    Eq,
    PartialOrd,
    Ord,
    Copy,
)]
pub struct StakePayout {
    amount: u128,
}

impl StakePayout {
    pub const SCALE: u128 = 10_000_000_000_000_000_000;

    pub fn new(amount: u64) -> Self {
        StakePayout {
            amount: amount as u128 * Self::SCALE,
        }
    }

    pub fn whole(&self) -> u64 {
        (self.amount / Self::SCALE) as u64
    }
    pub fn clear_whole(&mut self) {
        self.amount %= Self::SCALE;
    }

    pub fn remainder(&self) -> u64 {
        (self.amount % Self::SCALE) as u64
    }

    pub fn add(&mut self, other: StakePayout) {
        self.amount += other.amount
    }
}

impl std::ops::DivAssign<u64> for StakePayout {
    fn div_assign(&mut self, other: u64) {
        self.amount /= other as u128;
    }
}
impl std::ops::MulAssign<u64> for StakePayout {
    fn mul_assign(&mut self, other: u64) {
        self.amount *= other as u128;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_stake_payout_amount() {
        let mut stake = StakePayout::new(5_000);
        stake /= 365 * 24 * 3600 * 10;

        assert_eq!(
            stake,
            StakePayout {
                amount: 158548959918822
            }
        );
        assert_eq!(stake.whole(), 0);
        assert_eq!(stake.remainder(), 158548959918822);

        println!("{:0>1}.{:0>19}", stake.whole(), stake.remainder());

        stake = StakePayout::new(5_000_000_000);
        stake /= 365 * 24 * 3600 * 10;

        assert_eq!(
            stake,
            StakePayout {
                amount: 158548959918822932521
            }
        );
        assert_eq!(stake.whole(), 15);
        assert_eq!(stake.remainder(), 8548959918822932521);

        println!("{:0>1}.{:0>19}", stake.whole(), stake.remainder());
    }

    #[test]
    pub fn test_stake_payout_serialization() {
        let mut spo = StakePayout::new(984643132);
        spo /= 9234238;
        let data = spo.try_to_vec().unwrap();
        assert_eq!(data, 1066296030056838474381u128.to_le_bytes());
        let back = StakePayout::try_from_slice(&data).unwrap();
        assert_eq!(spo, back);
    }
}
