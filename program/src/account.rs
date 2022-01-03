use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::account_info::AccountInfo;
use solana_program::clock::UnixTimestamp;

use solana_program::msg;
use solana_program::{
    program_error::ProgramError, program_option::COption, program_pack::Pack, pubkey::Pubkey,
};
use spl_token::state::{Account, Mint};

use crate::error::StakingError;
use crate::{PRECISION, SECONDS_PER_YEAR};

/// Verifies that an account is a valid mint for an NFT
#[macro_export]
macro_rules! is_nft_mint {
    ($data:expr) => {
        match Mint::unpack(&$data) {
            Ok(mint) => {
                if !mint.is_initialized {
                    msg!("not initialized");
                    Err(StakingError::NFTOwnerNotNFT)
                } else if mint.decimals != 0 {
                    msg!("invalid decimals");
                    Err(StakingError::NFTOwnerNotNFT)
                } else if mint.supply != 1 {
                    msg!("invalid supply");
                    Err(StakingError::NFTOwnerNotNFT)
                } else if mint.mint_authority != COption::None {
                    msg!("mint authority is not locked");
                    Err(StakingError::NFTOwnerNotNFT)
                } else {
                    Ok(mint)
                }
            }
            _ => Err(StakingError::NFTOwnerNotNFT),
        }
    };
}

/// Account to hold global variables commonly used by instructions
#[repr(C)]
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Settings {
    /// SPL Token Mint accepted by instructions ("ZEE")
    pub token: Pubkey,
    /// Time (in seconds) that funds are locked after unstaking
    pub unbonding_duration: u64,

    /// The time at which emissions is reduced by 25%
    pub next_emission_change: UnixTimestamp,
    /// Amount of ZEE paid out during the current period
    pub emission: u64,

    // tokenomics variables
    // for a more detailed explanation of the algorithm and variables
    // see https://www.mathcha.io/editor/j4V1YiODsYQu8dee0NiO39Z05cePQvk0f9qPex6
    /// Total amount of ZEE staked
    pub total_stake: u64,
    /// The yield for every 1 ZEE staked, multiplied by PRECISION
    pub reward_per_share: u128,
    /// Last time the pool reward was updated
    pub last_reward: UnixTimestamp,
}

impl Settings {
    /// PDA of the settings account
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"settings"], program_id)
    }

    /// Verify if an address matches the settings PDA
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidSettingsAccount.into()),
        }
    }

    /// Decode the Settings account from `AccountInfo`.
    /// Verifies the address before deserializing the data.
    pub fn from_account_info(
        info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Settings, ProgramError> {
        Self::verify_program_address(info.key, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::ProgramNotInitialized.into())
    }

    /// Update the Reward per Share variable
    ///
    /// The basic formula is:
    ///   `reward per share += <time elapsed> * <emissions during that period> / <total amount staked>`
    ///
    /// Emissions are automatically reduced by 10% every year
    pub fn update_rewards(&mut self, now: UnixTimestamp) {
        if now <= self.last_reward {
            return;
        }

        let old_last_reward = self.last_reward;
        let old_rps = self.reward_per_share;

        if self.total_stake > 0 {
            let mut reward: u128 = 0;

            // emissions reduce by 10% every year, so if the period between `last_reward`
            // and `now` crosses the year threshold, we calculate the period in each year
            // separately
            // the math works across multiple year gaps though in production this would
            // never occur
            while now >= self.next_emission_change {
                let seconds = (self
                    .next_emission_change
                    .checked_sub(self.last_reward)
                    .unwrap()) as u128;
                reward = reward
                    .checked_add(
                        PRECISION
                            .checked_mul(self.emission as u128)
                            .unwrap()
                            .checked_div(SECONDS_PER_YEAR)
                            .unwrap()
                            .checked_div(self.total_stake as u128)
                            .unwrap()
                            .checked_mul(seconds)
                            .unwrap(),
                    )
                    .unwrap();

                self.last_reward = self.next_emission_change;
                self.next_emission_change += SECONDS_PER_YEAR as i64;
                self.emission = (self.emission as u128 * 9 / 10) as u64; // 90%
            }

            let seconds = (now - self.last_reward) as u128;
            reward = reward
                .checked_add(
                    PRECISION
                        .checked_mul(self.emission as u128)
                        .unwrap()
                        .checked_div(SECONDS_PER_YEAR)
                        .unwrap()
                        .checked_div(self.total_stake as u128)
                        .unwrap()
                        .checked_mul(seconds)
                        .unwrap(),
                )
                .unwrap();

            self.reward_per_share = self.reward_per_share.checked_add(reward).unwrap();
        }
        self.last_reward = now;

        msg!(
            "updated pool rewards. last_reward: {} -> {} ({} seconds), reward_per_share: {} -> {}, stake = {}",
            old_last_reward,
            self.last_reward,
            self.last_reward - old_last_reward,
            old_rps,
            self.reward_per_share,
            self.total_stake
        );
    }
}

/// The PDA that owns the reward pool associated account
#[derive(Debug, PartialEq, Clone, Copy, Eq)]
pub struct PoolAuthority {}
impl PoolAuthority {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"poolauthority"], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidPoolAuthorityAccount.into()),
        }
    }
}

/// The reward fund is the token account that pays out yield.
#[derive(Debug, PartialEq, Clone, Copy, Eq)]
pub struct RewardPool {}
impl RewardPool {
    pub fn program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"rewardpool"], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidRewardPoolAccount.into()),
        }
    }
}

/// The way that the "Authority" address of a Stake should be interpreted.
/// A "Basic" authority is a direct ownership of the stake by a wallet address.
/// An "NFT" authority is a delegated ownership, where the current holder of the
/// NFT is considered the owner.
#[derive(Debug, PartialEq, Eq, Clone, Copy, BorshDeserialize, BorshSerialize)]
pub enum Authority {
    /// A regular Solana address that can sign instructions
    Basic(Pubkey),
    /// An NFT mint address where the signer is the NFT's current holder
    NFT(Pubkey),
}

impl Authority {
    /// Verifies that an account matches the authority's type
    pub fn verify(&self, account: &AccountInfo) -> Result<(), ProgramError> {
        match self {
            Authority::Basic(pubkey) => {
                if *pubkey == Pubkey::default() {
                    msg!("Basic authority has null pubkey");
                    Err(StakingError::InvalidAuthorityType.into())
                } else if *pubkey != *account.key {
                    Err(StakingError::AuthorityKeysDoNotMatch.into())
                } else {
                    Ok(())
                }
            }
            Authority::NFT(mint) => {
                if *mint == Pubkey::default() {
                    msg!("NFT authority has null account");
                    Err(StakingError::InvalidAuthorityType.into())
                } else if *mint != *account.key {
                    Err(StakingError::AuthorityKeysDoNotMatch.into())
                } else {
                    match is_nft_mint!(account.data.borrow()) {
                        Ok(_) => Ok(()),
                        Err(err) => Err(err.into()),
                    }
                }
            }
        }
    }

    /// Verifies that the owner and signer accounts provided a valid signature for the authority type.
    /// For a basic authority, the owner and signer are the same account.
    /// For an NFT authority, the owner is the associated SPL token accont, the signer is the associated account's owner
    pub fn has_signed(&self, owner: &AccountInfo, signer: &AccountInfo) -> bool {
        match self {
            Authority::Basic(key) => {
                *key == *owner.key && *owner.key == *signer.key && signer.is_signer
            }
            Authority::NFT(mint) => {
                let account = Account::unpack(&owner.data.borrow()).unwrap(); // @todo better than unwrap?
                account.mint == *mint
                    && account.amount == 1
                    && account.owner == *signer.key
                    && signer.is_signer
            }
        }
    }
}

/// An Endpoint is a the entity that someone can stake against to share yield.
/// Each endpoint has an owner, which is the entity in charge of making
/// decisions about the Endpoint itself, once that functionality is implemented.
/// The Primary beneficiary receives 45% of the staker's yield, the secondary beneficiary
/// receives 5% of the staker's yield.
///
/// It is possible for an Endpoint to have no secondary Beneficiary, in which case the
/// the 5% stay in the reward pool.
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Endpoint {
    /// The time the endpoint was initialized
    pub creation_date: UnixTimestamp,
    /// Total amount of ZEE staked to this endpoint
    pub total_stake: u64,
    /// The owner of the endpoint
    pub owner: Authority,
    /// The primary beneficiary receiving 45% of yield
    pub primary: Pubkey,
    /// The secondary beneficiary receiving 5% of yield
    pub secondary: Pubkey,
}

impl Endpoint {
    pub fn from_account_info(
        info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Endpoint, ProgramError> {
        if info.owner != program_id {
            return Err(StakingError::InvalidEndpointAccount.into());
        }

        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::InvalidEndpointAccount.into())
    }
}

/// A Beneficiary receives yield based on the amount of ZEE staked.
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Beneficiary {
    /// The authority that owns the Beneficiary
    pub authority: Pubkey,
    /// The amount of ZEE staked for the beneficiary
    pub staked: u64,
    /// Helper variable. For more information see https://www.mathcha.io/editor/j4V1YiODsYQu8dee0NiO39Z05cePQvk0f9qPex6
    pub reward_debt: u64,
    /// Helper variable. The amount of ZEE that has been paid out theoretically but not transferred to the user's wallet
    /// due to technical limitations.
    pub holding: u64,
}

impl Beneficiary {
    pub fn program_address(authority: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"beneficiary", authority.as_ref()], program_id)
    }
    pub fn verify_program_address(
        address: &Pubkey,
        authority: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(authority, program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidBeneficiaryAccount.into()),
        }
    }

    pub fn from_account_info(
        info: &AccountInfo,
        authority: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<Beneficiary, ProgramError> {
        Self::verify_program_address(info.key, authority, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::InvalidBeneficiaryAccount.into())
    }

    /// True if there is no authority
    pub fn is_empty(&self) -> bool {
        self.authority == Pubkey::default()
    }

    /// The total amount of theoretical ZEE owed if the amount staked had been staked
    /// since the beginning of time.
    pub fn calculate_holding(&self, reward_per_share: u128) -> u64 {
        (self.staked as u128)
            .checked_mul(reward_per_share)
            .unwrap()
            .checked_div(PRECISION)
            .unwrap() as u64
    }

    /// Update the pending reward when the amount staked changes.
    pub fn pay_out(&mut self, new_stake: u64, reward_per_share: u128) {
        let pending = self.calculate_holding(reward_per_share) - self.reward_debt;

        self.staked = new_stake;
        self.reward_debt = self.calculate_holding(reward_per_share);
        self.holding += pending;
    }
}

/// The account that holds the data for a staker staking with a specific Endpoint.
#[derive(Debug, PartialEq, BorshDeserialize, BorshSerialize, Clone, Copy, Eq)]
pub struct Stake {
    /// Time the account was initiated
    pub creation_date: UnixTimestamp,

    /// The total amount currently staked before splitting it up to beneficiaries.
    pub total_stake: u64,

    /// The staker's address
    pub staker: Pubkey,

    /// The most recent time an amount was unstaked
    pub unbonding_end: UnixTimestamp,
    /// The total amount of pending funds
    pub unbonding_amount: u64,
}

impl Stake {
    pub fn fund_address(endpoint: &Pubkey, staker: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"stake fund", &endpoint.to_bytes(), &staker.to_bytes()],
            program_id,
        )
    }
    pub fn verify_fund_address(
        address: &Pubkey,
        endpoint: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::fund_address(endpoint, staker, program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidStakeFundAccount.into()),
        }
    }

    pub fn program_address(
        endpoint: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"stake", &endpoint.to_bytes(), &staker.to_bytes()],
            program_id,
        )
    }

    pub fn verify_program_address(
        address: &Pubkey,
        endpoint: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<u8, ProgramError> {
        match Self::program_address(endpoint, staker, program_id) {
            (real, seed) if real == *address => Ok(seed),
            _ => Err(StakingError::InvalidStakeAccount.into()),
        }
    }

    pub fn from_account_info(
        info: &AccountInfo,
        endpoint: &Pubkey,
        staker: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<Stake, ProgramError> {
        Self::verify_program_address(info.key, endpoint, staker, program_id)?;
        Self::try_from_slice(&info.data.borrow())
            .map_err(|_| StakingError::StakerInvalidStakeAccount.into())
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::BASE_REWARD;

    #[test]
    pub fn test_settings_serialization() {
        let v = Settings {
            token: Pubkey::new_unique(),
            unbonding_duration: 10 * 3600 * 24,
            next_emission_change: 98123798352345,
            emission: 23458972935823,

            reward_per_share: 348923452348342394u128,
            last_reward: 293458234234,
            total_stake: 9821429382935u64,
        };

        let data = v.try_to_vec().unwrap();
        let ret = Settings::try_from_slice(&data).unwrap();

        assert_eq!(v, ret);
    }

    #[test]
    pub fn test_settings_update_rewards() {
        let base = Settings {
            token: Pubkey::new_unique(),
            unbonding_duration: 0,

            next_emission_change: SECONDS_PER_YEAR as i64,
            emission: BASE_REWARD as u64,

            reward_per_share: 0,
            last_reward: 0,
            total_stake: 1, // makes math easier,
        };

        let mut previous: Vec<Settings> = vec![];
        let breakpoints: Vec<(u128, u128)> = vec![
            (0, 0),
            (1, PRECISION * BASE_REWARD / SECONDS_PER_YEAR), // one second
            (86400, PRECISION * BASE_REWARD / SECONDS_PER_YEAR * 86400), // one day
            (
                SECONDS_PER_YEAR - 1,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * (SECONDS_PER_YEAR - 1),
            ),
            (
                SECONDS_PER_YEAR,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR + 1,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 9 / 10) / SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR + 2,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 9 / 10) / SECONDS_PER_YEAR * 2,
            ),
            (
                SECONDS_PER_YEAR * 2,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 9 / 10) / SECONDS_PER_YEAR * SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR * 3,
                PRECISION * BASE_REWARD / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 9 / 10) / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 9 / 10 * 9 / 10) / SECONDS_PER_YEAR
                        * SECONDS_PER_YEAR,
            ),
            (
                SECONDS_PER_YEAR * 3 + 1,
                PRECISION
                    .checked_mul(BASE_REWARD)
                    .unwrap()
                    .checked_div(SECONDS_PER_YEAR)
                    .unwrap()
                    .checked_mul(SECONDS_PER_YEAR)
                    .unwrap()
                    + PRECISION * (BASE_REWARD * 9 / 10) / SECONDS_PER_YEAR * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 9 / 10 * 9 / 10) / SECONDS_PER_YEAR
                        * SECONDS_PER_YEAR
                    + PRECISION * (BASE_REWARD * 9 / 10 * 9 / 10 * 9 / 10) / SECONDS_PER_YEAR,
            ),
        ];

        for (secs, rps) in breakpoints {
            let mut settings = base.clone();

            settings.update_rewards(secs as i64);
            assert_eq!(rps, settings.reward_per_share);

            previous.iter_mut().all(|prev| {
                prev.update_rewards(secs as i64);
                prev.reward_per_share == rps
            });

            previous.push(settings);
        }
    }

    #[test]
    pub fn test_deserialize_empty() {
        let data = [0; 56];
        let beneficiary: Beneficiary = Beneficiary::try_from_slice(&data).unwrap();
        assert_eq!(beneficiary.authority, Pubkey::default());
        assert_eq!(beneficiary.staked, 0);
        assert_eq!(beneficiary.reward_debt, 0);
        assert_eq!(beneficiary.holding, 0);
    }

    #[test]
    pub fn test_verify_nft_macro() {
        let mut data = [0; Mint::LEN];

        let ok_mint = Mint {
            mint_authority: COption::None,
            supply: 1,
            decimals: 0,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(ok_mint, &mut data).unwrap();
        assert_eq!(Ok(ok_mint), is_nft_mint!(data));

        let bad_mint_authority = Mint {
            mint_authority: COption::Some(Pubkey::new_unique()),
            supply: 1,
            decimals: 0,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_authority, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));

        let bad_mint_supply = Mint {
            mint_authority: COption::None,
            supply: 2,
            decimals: 0,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_supply, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));

        let bad_mint_decimals = Mint {
            mint_authority: COption::None,
            supply: 1,
            decimals: 10,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_decimals, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));

        let bad_mint_initialized = Mint {
            mint_authority: COption::None,
            supply: 1,
            decimals: 0,
            is_initialized: false,
            freeze_authority: COption::None,
        };
        Mint::pack(bad_mint_initialized, &mut data).unwrap();
        assert_eq!(Err(StakingError::NFTOwnerNotNFT), is_nft_mint!(data));
    }
}
