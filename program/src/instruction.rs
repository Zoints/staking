use borsh::{BorshDeserialize, BorshSerialize};

#[repr(C)]
#[derive(Clone, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum StakingInstruction {
    /// Initialize the program after deploying it for the first time.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[writable]` Settings account
    ///     3. `[]` Pool Authority
    ///     4. `[writable]` Reward Pool
    ///     5. `[]` ZEE Token Mint
    ///     6. `[signer]` Fee Beneficiary Authority
    ///     7. `[writable]` Fee Beneficiary
    ///     8. `[]` Rent Sysvar
    ///     9. `[]` SPL Token Program
    ///     10. `[]` System Program
    Initialize {
        /// The time after which yields start to pay out
        start_time: i64,
        /// The amount of time (in seconds) to lock unbonded funds
        unbonding_duration: u64,
    },
    /// Register a new endpoint.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[]` Endpoint Owner
    ///     3. `[writable,signer]` Endpoint Account
    ///     4. `[]` Primary Beneficiary Authority
    ///     5. `[]` Primary Beneficiary
    ///     6. `[]` Secondary Beneficiary Authority
    ///     7. `[]` Secondary Beneficiary
    ///     8. `[]` Rent Sysvar
    ///     9. `[]` Clock Sysvar
    ///     10. `[]` System Program
    RegisterEndpoint,
    /// Initialize a new stake
    ///
    /// Must be done before being able to stake ZEE to an Endpoint
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Staker
    ///     3. `[writable]` Staker Fund
    ///     4. `[writable]` Staker Beneficiary
    ///     5. `[writable]` Endpoint Account
    ///     6. `[writable]` Stake Account
    ///     7. `[]` ZEE Token Mint
    ///     8. `[]` Settings Account
    ///     9. `[]` Rent Sysvar
    ///     10. `[]` Clock Sysvar
    ///     11. `[]` SPL Token Program
    ///     12. `[]` System Program
    InitializeStake,
    /// Stake ZEE
    ///
    /// To withdraw, you can stake negative amount. To just harvest yield, you
    /// can stake zero. Unless everything is withdrawn at the same time, there
    /// must always be at least 1000 ZEE staked.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Staker
    ///     3. `[writable]` Staker Beneficiary
    ///     4. `[writable]` Staker Fund
    ///     5. `[writable]` Staker ZEE Token Account
    ///     6. `[writable]` Endpoint
    ///     7. `[writable]` Endpoint Primary Beneficiary
    ///     8. `[writable]` Endpoint Secondary Beneficiary
    ///     9. `[]` Pool Authority
    ///     10. `[writable]` Reward Pool
    ///     11. `[writable]` Settings
    ///     12. `[writable]` Fee Beneficiary
    ///     13. `[writable]` Stake Account
    ///     14. `[]` Clock Sysvar
    ///     15. `[]` SPL Token Program
    Stake { amount: i64 },
    /// Withdraw Unbounded Tokens
    ///
    /// Transfer the unbounded tokens to a wallet once the duration has passed.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Staker
    ///     3. `[signer]` Staker Fund
    ///     4. `[writable]` Staker's ZEE Token Account
    ///     5. `[]` Endpoint
    ///     6. `[]` Settings
    ///     7. `[]` Pool Authority
    ///     8. `[writable]` Stake Account
    ///     9. `[]` Clock Sysvar
    ///     10. `[]` SPL Token Program
    WithdrawUnbond,
    /// Claim Beneficiary Yield
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Beneficiary Authority
    ///     3. `[writable]` Beneficiary Account
    ///     4. `[writable]` Authority's ZEE Token Account
    ///     5. `[writable]` Settings
    ///     6. `[]` Pool Authority
    ///     7. `[writable]` Reward Pool
    ///     8. `[]` Clock Sysvar
    ///     9. `[]` SPL Token Program
    Claim,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    pub fn test_serialize() {
        let amount = 12345;
        let init = StakingInstruction::Stake { amount };
        let data = init.try_to_vec().unwrap();

        let mut should = vec![3];
        should.extend(amount.to_le_bytes().iter());

        assert_eq!(data, should);
    }
}
