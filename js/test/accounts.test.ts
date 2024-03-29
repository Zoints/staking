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
    Authority,
    AuthorityType
} from '../src';

describe('Settings', () => {
    const raw = Buffer.from([
        0xc9, 0xf5, 0xf2, 0xcb, 0x38, 0x89, 0x94, 0x9d, 0xa6, 0x2d, 0xb6, 0xe8,
        0xa4, 0xac, 0x33, 0x06, 0x4a, 0x5f, 0x3f, 0xe7, 0xeb, 0x3b, 0xba, 0x90,
        0x45, 0x74, 0x2b, 0x04, 0x8c, 0xb2, 0x5d, 0xcd, 0x3c, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x36, 0x1e, 0x5a, 0x63, 0x00, 0x00, 0x00, 0x00,
        0x00, 0xfc, 0x8d, 0x0e, 0x80, 0x00, 0x00, 0x00, 0xa3, 0x96, 0x13, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x7e, 0x78, 0xe0, 0xf8, 0x78, 0x07, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0xed, 0x78, 0x61,
        0x00, 0x00, 0x00, 0x00
    ]);

    const settings: Settings = borsh.deserialize(ACCOUNT_SCHEMA, Settings, raw);

    it('should be equal', () => {
        expect(settings.token).to.eql(
            new PublicKey('EbNTzBUBwP5vZLu71vVqLYdrkzayJ4dLCoQcs6vghZUY')
        );

        expect(settings.unbondingTime.eqn(60)).to.be.true;
        expect(settings.nextEmissionChange).to.eql(
            new Date('2022-10-27 05:59:18.000+00')
        );

        expect(settings.emission.eq(BASE_REWARD)).to.be.true;
        expect(settings.totalStake.eqn(1283747)).to.be.true;

        expect(settings.rewardPerShare.eq(new BN('8216152930430', 10))).to.be
            .true;
        expect(settings.lastReward).to.eql(
            new Date('2021-10-27 06:11:20.000+00')
        );
    });
});

describe('Endpoint', () => {
    const raw = Buffer.from([
        0xf2, 0xaf, 0x72, 0x61, 0x00, 0x00, 0x00, 0x00, 0xc0, 0xd4, 0x01, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x06, 0x16, 0x19, 0x9c, 0x9f, 0x29, 0x4a,
        0x9e, 0x10, 0x92, 0x58, 0xc9, 0xb2, 0x5b, 0xb6, 0x7d, 0x20, 0x94, 0x4a,
        0x31, 0x04, 0x28, 0xb9, 0x8d, 0x51, 0xf8, 0x57, 0xc6, 0xa1, 0x49, 0x91,
        0x3c, 0x5f, 0x05, 0xc2, 0x50, 0x29, 0x6c, 0xa8, 0xca, 0xdc, 0xb3, 0x52,
        0x3c, 0xbc, 0xd0, 0x67, 0x99, 0xd9, 0x36, 0x6b, 0xd6, 0x7c, 0xdf, 0x7b,
        0x4a, 0x0e, 0xb0, 0xf5, 0x00, 0x55, 0x61, 0x22, 0xf1, 0x92, 0x17, 0x8a,
        0x23, 0x7c, 0x3d, 0x90, 0x8a, 0x17, 0x36, 0x0d, 0x2e, 0xb6, 0x46, 0x6a,
        0xcd, 0xf1, 0x45, 0x11, 0x50, 0xc4, 0x5a, 0x28, 0xa5, 0xa9, 0x22, 0x33,
        0x65, 0xc9, 0xb1, 0x77, 0xa9
    ]);

    const endpoint: Endpoint = borsh.deserialize(ACCOUNT_SCHEMA, Endpoint, raw);

    it('should be equal', () => {
        expect(endpoint.creationDate).to.be.eql(
            new Date('2021-10-22 12:34:58.000+00')
        );

        expect(endpoint.totalStake.eqn(120000)).to.be.true;

        expect(endpoint.owner).to.be.eql(
            Authority.NFT(
                new PublicKey('QkzWg35HR5SsXRLHwUHnc4b1ch5YRijXp1sjxHeSCWf')
            )
        );

        expect(endpoint.primary).to.be.eql(
            new PublicKey('7PvppyrJna8fJzeNN5JUtJShsnAGT8ef7D8nwHKSMh2g')
        );

        expect(endpoint.secondary).to.be.eql(
            new PublicKey('AqHLrtuQ31UDRDdgRmy6XtVzz7twSjB5K9LeNYa6QSiL')
        );
    });
});

describe('Endpoint without secondary', () => {
    const raw = Buffer.from([
        0xf2, 0xaf, 0x72, 0x61, 0x00, 0x00, 0x00, 0x00, 0xc0, 0xd4, 0x01, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x06, 0x16, 0x19, 0x9c, 0x9f, 0x29, 0x4a,
        0x9e, 0x10, 0x92, 0x58, 0xc9, 0xb2, 0x5b, 0xb6, 0x7d, 0x20, 0x94, 0x4a,
        0x31, 0x04, 0x28, 0xb9, 0x8d, 0x51, 0xf8, 0x57, 0xc6, 0xa1, 0x49, 0x91,
        0x3c, 0x5f, 0x05, 0xc2, 0x50, 0x29, 0x6c, 0xa8, 0xca, 0xdc, 0xb3, 0x52,
        0x3c, 0xbc, 0xd0, 0x67, 0x99, 0xd9, 0x36, 0x6b, 0xd6, 0x7c, 0xdf, 0x7b,
        0x4a, 0x0e, 0xb0, 0xf5, 0x00, 0x55, 0x61, 0x22, 0xf1, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const endpoint: Endpoint = borsh.deserialize(ACCOUNT_SCHEMA, Endpoint, raw);

    it('should be equal', () => {
        expect(endpoint.creationDate).to.be.eql(
            new Date('2021-10-22 12:34:58.000+00')
        );

        expect(endpoint.totalStake.eqn(120000)).to.be.true;

        expect(endpoint.owner).to.be.eql(
            Authority.NFT(
                new PublicKey('QkzWg35HR5SsXRLHwUHnc4b1ch5YRijXp1sjxHeSCWf')
            )
        );

        expect(endpoint.primary).to.be.eql(
            new PublicKey('7PvppyrJna8fJzeNN5JUtJShsnAGT8ef7D8nwHKSMh2g')
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
