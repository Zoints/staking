import { expect } from 'chai';
import 'mocha';
import * as borsh from 'borsh';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { BASE_REWARD, Community, Stake, Settings, Beneficiary } from '../src';

describe('Settings', () => {
    const raw = Buffer.from([
        0x3f, 0xde, 0x5f, 0x3b, 0x64, 0x32, 0xa6, 0xf6, 0xcf, 0x51, 0xef, 0xf7,
        0xe6, 0x9f, 0x68, 0xca, 0x52, 0x87, 0xbd, 0x1c, 0x91, 0xbc, 0xd1, 0x80,
        0x80, 0xcf, 0xa4, 0xea, 0x4c, 0xc5, 0xca, 0xae, 0x3c, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x10, 0x68, 0xf7, 0xde, 0xdb, 0x49, 0x48, 0xac,
        0x12, 0xaa, 0xf6, 0xc2, 0x6c, 0xb5, 0x19, 0xc0, 0x26, 0x61, 0xf5, 0x82,
        0x47, 0x0b, 0xe8, 0x00, 0xd7, 0xfe, 0x10, 0x34, 0x06, 0x50, 0x1c, 0xd1,
        0xa3, 0x09, 0xf2, 0x62, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x2e, 0x8c,
        0xd1, 0x00, 0x00, 0x00, 0x40, 0x42, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x99, 0x12, 0x90, 0x91, 0x66, 0x42, 0x0c, 0xf0, 0x33, 0x4a, 0x02, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x2f, 0xd7, 0x10, 0x61, 0x00, 0x00, 0x00, 0x00
    ]);

    const settings: Settings = borsh.deserialize(
        Settings.schema,
        Settings,
        raw
    );

    it('should be equal', () => {
        expect(settings.token).to.eql(
            new PublicKey('5JKMQjbzy1T4w8e84wZ6rVmRZXi7gz4t7ugA9BrYNJuj')
        );

        expect(settings.unbondingTime.eqn(60)).to.be.true;
        expect(settings.nextEmissionChange).to.eql(
            new Date('2022-08-09 07:15:47.000+00')
        );

        expect(settings.emission.eq(BASE_REWARD)).to.be.true;
        expect(settings.totalStake.eqn(1000000)).to.be.true;

        expect(settings.rewardPerShare.eq(new BN('2768264840182648401826457')))
            .to.be.true;
        expect(settings.lastReward).to.eql(
            new Date('2021-08-09 07:20:15.000+00')
        );
    });
});

describe('Community', () => {
    const raw = Buffer.from([
        0xc7, 0xd6, 0x10, 0x61, 0x00, 0x00, 0x00, 0x00, 0x10, 0x54, 0xb0, 0x9b,
        0x55, 0x6f, 0xee, 0x63, 0xe1, 0x47, 0x67, 0xc9, 0x8c, 0x2b, 0x50, 0x2b,
        0xe6, 0x91, 0xa3, 0xae, 0xa2, 0x0e, 0xfe, 0x0a, 0x7e, 0x6d, 0xe6, 0xfd,
        0xbb, 0xa3, 0x4e, 0x82, 0x17, 0xce, 0x3d, 0x94, 0xa6, 0x67, 0x18, 0xa6,
        0x29, 0xc5, 0x50, 0x3e, 0x44, 0x8f, 0x79, 0x6f, 0xeb, 0xb1, 0xbd, 0x1f,
        0x94, 0x8f, 0x1b, 0xb2, 0x36, 0x46, 0x6a, 0xe4, 0x1b, 0x3c, 0x98, 0x86,
        0x59, 0xce, 0xd4, 0x9d, 0x7f, 0x89, 0xb8, 0xdd, 0xd0, 0x4e, 0xe5, 0x10,
        0x69, 0x31, 0xab, 0xa6, 0x1a, 0x1f, 0x34, 0x97, 0xdf, 0x20, 0x26, 0x6c,
        0xc3, 0x94, 0x5a, 0xdc, 0x2d, 0x76, 0x8d, 0x6c
    ]);

    const community: Community = borsh.deserialize(
        Community.schema,
        Community,
        raw
    );

    it('should be equal', () => {
        expect(community.creationDate).to.be.eql(
            new Date('2021-08-09 07:18:31.000+00')
        );

        expect(community.authority).to.be.eql(
            new PublicKey('26kRZ2nGeghPoxKPF6fsp1Ucfno4eQwdprhNNaNfbcY1')
        );

        expect(community.primary).to.be.eql(
            new PublicKey('2bvn5d4krBDdCXEMH9KKHPx8xGauv6wEsaPZWAyYnUJh')
        );

        expect(community.secondary).to.be.eql(
            new PublicKey('73aD1aXy4Z1arEYHCVxefmZHm4PgHTY7fxXTD34bSirf')
        );
    });
});

describe('Community without secondary', () => {
    const raw = Buffer.from([
        0xca, 0xd8, 0x10, 0x61, 0x00, 0x00, 0x00, 0x00, 0x9b, 0xa0, 0x0e, 0x11,
        0x67, 0x2c, 0xe7, 0xcd, 0x07, 0x48, 0x73, 0xb8, 0xea, 0x43, 0xf2, 0x26,
        0x88, 0xd2, 0x22, 0x01, 0xa7, 0xc4, 0x92, 0xdd, 0x4a, 0xb4, 0xf7, 0x3d,
        0xff, 0xba, 0x65, 0xda, 0xde, 0xb7, 0x1a, 0x5e, 0xc0, 0xd4, 0xd2, 0x99,
        0xd2, 0x08, 0x77, 0x5e, 0x41, 0x14, 0x0f, 0x76, 0xd5, 0xb4, 0x77, 0x6f,
        0x4a, 0x18, 0xcd, 0x21, 0x8b, 0x55, 0xb4, 0x1e, 0x72, 0x78, 0x86, 0x07,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const community: Community = borsh.deserialize(
        Community.schema,
        Community,
        raw
    );

    it('should be equal', () => {
        expect(community.creationDate).to.be.eql(
            new Date('2021-08-09 07:27:06.000+00')
        );

        expect(community.authority).to.be.eql(
            new PublicKey('BUVkJSm8io8saymCGLENJrWaFSqakJ1jeU9obiAgDVMs')
        );

        expect(community.primary).to.be.eql(
            new PublicKey('FzPSsnfSC7bWgn3Xys4CT2dXk42FU4MUR4fyKmzhrDt2')
        );

        expect(community.secondary).to.be.eql(PublicKey.default);
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

    const stake: Stake = borsh.deserialize(Stake.schema, Stake, raw);

    it('should be equal', () => {
        expect(stake.creationDate).to.be.eql(
            new Date('2021-08-09 07:18:38.000+00')
        );

        expect(stake.totalStake.eqn(999500)).to.be.true;

        expect(stake.staker).to.be.eql(
            new PublicKey('2BmEn6gnEDEPstnVW8Ek7gAmsVRhK5J9V1h6idSvcSrQ')
        );

        expect(stake.unbondingStart).to.be.eql(
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
        Beneficiary.schema,
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
