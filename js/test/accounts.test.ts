import { expect } from 'chai';
import 'mocha';
import * as borsh from 'borsh';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
    BASE_REWARD,
    Endpoint,
    Stake,
    Settings,
    Beneficiary,
    ACCOUNT_SCHEMA,
    OwnerType
} from '../src';

describe('Settings', () => {
    const raw = Buffer.from([
        0x7f, 0x4b, 0xc3, 0x00, 0xcd, 0x8f, 0x47, 0x38, 0x3a, 0x77, 0x7e, 0x8a,
        0x17, 0x76, 0x80, 0x42, 0x50, 0xd7, 0x68, 0x27, 0x57, 0xbe, 0x4b, 0xb8,
        0xc4, 0x31, 0x09, 0x15, 0x8a, 0x3f, 0x27, 0x29, 0x3c, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xd3, 0x51, 0x45, 0x63, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x28, 0x2e, 0x8c, 0xd1, 0x00, 0x00, 0x00, 0x40, 0x42, 0x0f, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xd4, 0x7c, 0xea, 0xe4, 0x84, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc4, 0x1e, 0x64, 0x61,
        0x00, 0x00, 0x00, 0x00
    ]);

    const settings: Settings = borsh.deserialize(ACCOUNT_SCHEMA, Settings, raw);

    it('should be equal', () => {
        expect(settings.token).to.eql(
            new PublicKey('9ZunLZ6xdPsW7D7kZnJrRAT3G6inWFLPCgpWUiHLRGiL')
        );

        expect(settings.unbondingTime.eqn(60)).to.be.true;
        expect(settings.nextEmissionChange).to.eql(
            new Date('2022-10-11 11:21:55.000+00')
        );

        expect(settings.emission.eq(BASE_REWARD)).to.be.true;
        expect(settings.totalStake.eqn(1000000)).to.be.true;

        expect(settings.rewardPerShare.eq(new BN('570776255700'))).to.be.true;
        expect(settings.lastReward).to.eql(
            new Date('2021-10-11 11:23:48.000+00')
        );
    });
});

describe('Endpoint', () => {
    const raw = Buffer.from([
        0x6e, 0xc6, 0x66, 0x61, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x7e, 0x0e, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x13, 0xbe, 0x6c, 0xc0, 0xc9, 0x2c, 0x3b,
        0x92, 0x44, 0x09, 0x58, 0x03, 0x8a, 0x3d, 0x67, 0xbd, 0x87, 0x9d, 0xe2,
        0x2c, 0x22, 0x75, 0x82, 0x21, 0x24, 0x49, 0x70, 0x21, 0xd0, 0x05, 0xbf,
        0x05, 0x0b, 0x44, 0x8d, 0xef, 0x91, 0xee, 0x9f, 0xcd, 0xe6, 0xc2, 0x9d,
        0x9a, 0x60, 0xd8, 0x8b, 0x40, 0x1a, 0x24, 0xd4, 0xef, 0xd8, 0x8f, 0x03,
        0x71, 0xda, 0x9d, 0x34, 0x27, 0x30, 0xda, 0x82, 0x4e, 0x7f, 0x93, 0x7d,
        0xaf, 0xff, 0x24, 0x94, 0xc1, 0x0f, 0x23, 0xbd, 0x41, 0x27, 0x10, 0xaf,
        0xc4, 0x8c, 0xc5, 0x52, 0xfc, 0x2e, 0x65, 0x53, 0x91, 0xa4, 0x97, 0x7a,
        0xf5, 0x61, 0x0d, 0x6f, 0x2c
    ]);

    const endpoint: Endpoint = borsh.deserialize(ACCOUNT_SCHEMA, Endpoint, raw);

    it('should be equal', () => {
        expect(endpoint.creationDate).to.be.eql(
            new Date('2021-10-13 11:43:42.000+00')
        );

        expect(endpoint.totalStake.eqn(950000)).to.be.true;

        expect(endpoint.ownerType).to.be.eql(OwnerType.Basic);

        expect(endpoint.owner).to.be.eql(
            new PublicKey('2L5ADeHHkBBAd1iDif9ZejyjiPD1q5NwCD9XMRFC4f4Q')
        );

        expect(endpoint.primary).to.be.eql(
            new PublicKey('kz7eQMpDn8xzSgk4abeHkRwBmGdbbNrvbrgJsbXRkVB')
        );

        expect(endpoint.secondary).to.be.eql(
            new PublicKey('9b1Diya2ShM1qdtiXXngt5BiSzEoV348yxqcUWx9cmuV')
        );
    });
});

describe('Endpoint without secondary', () => {
    const raw = Buffer.from([
        0x6e, 0xc6, 0x66, 0x61, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x7e, 0x0e, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x13, 0xbe, 0x6c, 0xc0, 0xc9, 0x2c, 0x3b,
        0x92, 0x44, 0x09, 0x58, 0x03, 0x8a, 0x3d, 0x67, 0xbd, 0x87, 0x9d, 0xe2,
        0x2c, 0x22, 0x75, 0x82, 0x21, 0x24, 0x49, 0x70, 0x21, 0xd0, 0x05, 0xbf,
        0x05, 0x0b, 0x44, 0x8d, 0xef, 0x91, 0xee, 0x9f, 0xcd, 0xe6, 0xc2, 0x9d,
        0x9a, 0x60, 0xd8, 0x8b, 0x40, 0x1a, 0x24, 0xd4, 0xef, 0xd8, 0x8f, 0x03,
        0x71, 0xda, 0x9d, 0x34, 0x27, 0x30, 0xda, 0x82, 0x4e, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const endpoint: Endpoint = borsh.deserialize(ACCOUNT_SCHEMA, Endpoint, raw);

    it('should be equal', () => {
        expect(endpoint.creationDate).to.be.eql(
            new Date('2021-10-13 11:43:42.000+00')
        );

        expect(endpoint.totalStake.eqn(950000)).to.be.true;

        expect(endpoint.ownerType).to.be.eql(OwnerType.Basic);

        expect(endpoint.owner).to.be.eql(
            new PublicKey('2L5ADeHHkBBAd1iDif9ZejyjiPD1q5NwCD9XMRFC4f4Q')
        );

        expect(endpoint.primary).to.be.eql(
            new PublicKey('kz7eQMpDn8xzSgk4abeHkRwBmGdbbNrvbrgJsbXRkVB')
        );

        expect(endpoint.secondary).to.be.eql(PublicKey.default);
    });
});

describe('Stake', () => {
    const raw = Buffer.from([
        0xce, 0xd6, 0x10, 0x61, 0x00, 0x00, 0x00, 0x00, 0x4c, 0x40, 0x0f, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x11, 0x9d, 0x83, 0xba, 0xb3, 0x55, 0x8b, 0x28,
        0xee, 0xba, 0x2d, 0xe8, 0xec, 0x95, 0xad, 0x03, 0x3f, 0x38, 0x2a, 0x12,
        0x8f, 0xe1, 0x32, 0xec, 0x76, 0xc0, 0xd4, 0x2f, 0x71, 0x58, 0xfc, 0x9d,
        0xe2, 0xde, 0x10, 0x61, 0x00, 0x00, 0x00, 0x00, 0xf4, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00
    ]);

    const stake: Stake = borsh.deserialize(ACCOUNT_SCHEMA, Stake, raw);

    it('should be equal', () => {
        expect(stake.creationDate).to.be.eql(
            new Date('2021-08-09 07:18:38.000+00')
        );

        expect(stake.totalStake.eqn(999500)).to.be.true;

        expect(stake.staker).to.be.eql(
            new PublicKey('2BmEn6gnEDEPstnVW8Ek7gAmsVRhK5J9V1h6idSvcSrQ')
        );

        expect(stake.unbondingEnd).to.be.eql(
            new Date('2021-08-09 07:53:06.000+00')
        );
        expect(stake.unbondingAmount.eqn(500)).to.be.true;
    });
});

describe('Beneficiary', () => {
    const raw = Buffer.from([
        0x11, 0x9d, 0x83, 0xba, 0xb3, 0x55, 0x8b, 0x28, 0xee, 0xba, 0x2d, 0xe8,
        0xec, 0x95, 0xad, 0x03, 0x3f, 0x38, 0x2a, 0x12, 0x8f, 0xe1, 0x32, 0xec,
        0x76, 0xc0, 0xd4, 0x2f, 0x71, 0x58, 0xfc, 0x9d, 0x5f, 0x76, 0x1b, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x91, 0xa6, 0xdc, 0x04, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const beneficiary: Beneficiary = borsh.deserialize(
        ACCOUNT_SCHEMA,
        Beneficiary,
        raw
    );

    it('should be equal', () => {
        expect(beneficiary.authority).to.be.eql(
            new PublicKey('2BmEn6gnEDEPstnVW8Ek7gAmsVRhK5J9V1h6idSvcSrQ')
        );

        expect(beneficiary.holding.eqn(0)).to.be.true;
        expect(beneficiary.rewardDebt.eq(new BN('81569425'))).to.be.true;
        expect(beneficiary.staked.eqn(1799775)).to.be.true;
    });
});
