use borsh::{BorshDeserialize, BorshSerialize};

#[repr(C)]
#[derive(Clone, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum StakingInstruction {
    Initialize { sponsor_fee: u64 },
    RegisterCommunity,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    pub fn test_serialize() {
        let sponsor_fee = 12345;
        let init = StakingInstruction::Initialize { sponsor_fee };
        let data = init.try_to_vec().unwrap();

        let mut should = vec![0];
        should.extend(sponsor_fee.to_le_bytes().iter());

        assert_eq!(data, should);
    }
}
