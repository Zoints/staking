import { expect } from 'chai';
import 'mocha';
import * as borsh from 'borsh';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { BASE_REWARD, Community, Stake, Settings } from '../src';
/*
describe('Settings', () => {
    const raw = Buffer.from([
        0x79, 0x85, 0x66, 0x6b, 0x17, 0x85, 0x79, 0x3a, 0xc4, 0xa4, 0x72, 0x84,
        0x7b, 0x32, 0x16, 0x74, 0xb2, 0xa6, 0xc4, 0x9f, 0x5b, 0xa6, 0x70, 0x40,
        0x8e, 0xff, 0x3a, 0x62, 0x2b, 0x7c, 0xfe, 0x78, 0x3c, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x4f, 0x2f, 0x14, 0xdf, 0x99, 0x3c, 0x96, 0xca,
        0x32, 0x28, 0x49, 0x2e, 0x80, 0x9e, 0xf5, 0x7f, 0x17, 0x13, 0x9b, 0xd0,
        0xd4, 0x0f, 0x86, 0x1c, 0xda, 0xff, 0x61, 0x29, 0x90, 0x51, 0x54, 0xf1,
        0xa0, 0x86, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x72, 0x9f, 0x24, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0xfe, 0xb2, 0xc6, 0x62, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x2e, 0x8c,
        0xd1, 0x00, 0x00, 0x00, 0x80, 0x84, 0x1e, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x2d, 0x00, 0x6d, 0xa9, 0x34, 0x6f, 0x9c, 0x7d, 0x70, 0xda, 0x13, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xbe, 0x83, 0xe5, 0x60, 0x00, 0x00, 0x00, 0x00
    ]);

    const settings: Settings = borsh.deserialize(
        Settings.schema,
        Settings,
        raw
    );

    it('should be equal', () => {
        expect(settings.token).to.eql(
            new PublicKey('9BNK3dwVowAWSJhghPL9KLe34P9rubH4DZCPc8Eiddbd')
        );

        expect(settings.unbondingTime.eqn(60)).to.be.true;
        expect(settings.nextEmissionChange).to.eql(
            new Date('2022-07-07 10:18:38.000+00')
        );

        expect(settings.emission.eq(BASE_REWARD)).to.be.true;
        expect(settings.totalStake.eqn(2000000)).to.be.true;

        expect(settings.rewardPerShare.eq(new BN('24001141552511415525113901')))
            .to.be.true;
        expect(settings.lastReward).to.eql(
            new Date('2021-07-07 10:36:46.000+00')
        );
    });

    it('should calculate', () => {
        expect(
            // one day
            settings
                .calculateRewardPerShare(new Date('2021-07-08 10:36:46.000+00'))
                .eq(new BN('1256877853881278538812729901'))
        ).to.be.true;
        expect(
            // one year
            settings
                .calculateRewardPerShare(new Date('2022-07-07 10:36:46.000+00'))
                .eq(new BN('450020119863013698630116826221'))
        ).to.be.true;
        expect(
            // one year one month
            settings
                .calculateRewardPerShare(new Date('2022-08-07 10:36:46.000+00'))
                .eq(new BN('478684503424657534246553898221'))
        ).to.be.true;
    });
});

describe('Community', () => {
    const raw = Buffer.from([
        0x90, 0xd2, 0xde, 0x60, 0x00, 0x00, 0x00, 0x00, 0x39, 0xfb, 0xed, 0x3a,
        0xd4, 0x64, 0xea, 0x49, 0x18, 0xf3, 0x47, 0xad, 0x8f, 0xfb, 0xdb, 0x15,
        0x4a, 0x31, 0xc7, 0xd4, 0x0f, 0x4e, 0x2c, 0x50, 0xcb, 0xa0, 0xc7, 0xd1,
        0x11, 0xbf, 0x22, 0x52, 0xff, 0x88, 0xe4, 0x69, 0x65, 0xf5, 0xb2, 0x0e,
        0xf9, 0xda, 0x95, 0x6f, 0xc0, 0x68, 0x05, 0x7d, 0xb9, 0x48, 0x25, 0x00,
        0x7b, 0xb7, 0x49, 0xcd, 0xa9, 0x60, 0x92, 0xf6, 0x3d, 0xe3, 0x8b, 0xfc,
        0x86, 0x7c, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0xa8, 0x3d, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x6b, 0x65, 0x3a, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x30, 0x4f, 0x6b, 0x5f, 0xed, 0xe3, 0x8c, 0x14, 0xbc, 0x89, 0x9b, 0xda,
        0xb7, 0x0a, 0xd5, 0x3a, 0xe9, 0x38, 0xec, 0x28, 0x8f, 0xdd, 0xc2, 0xed,
        0xf7, 0xfb, 0xb4, 0x3f, 0x97, 0x96, 0x1a, 0x43, 0x01, 0x71, 0x01, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xbe, 0xb3, 0x0d, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x4e, 0x18, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const community: Community = borsh.deserialize(
        Community.schema,
        Community,
        raw
    );

    it('should be equal', () => {
        expect(community.creationDate).to.be.eql(
            new Date('2021-07-02 08:47:12.000+00')
        );

        expect(community.authority).to.be.eql(
            new PublicKey('4uM3Z2mw5hvbKe3VVceAKFK1DSereFaYBh7Xa43DoFbw')
        );

        expect(community.primary.isEmpty()).to.be.false;
        expect(community.primary.authority).to.be.eql(
            new PublicKey('JCW2ofkJktvnqQYXuhfJCRgYVnrJAeeqdnyUVixaSB5M')
        );
        expect(community.primary.staked.eqn(425094)).to.be.true;
        expect(community.primary.rewardDebt.eqn(4040936)).to.be.true;
        expect(community.primary.pendingReward.eqn(3827051)).to.be.true;

        expect(community.secondary.isEmpty()).to.be.false;
        expect(community.secondary.authority).to.be.eql(
            new PublicKey('4FaotbbKMnmKzNKv4K6V2B2tLpa3yv9ASSUmfpZrdqYE')
        );
        expect(community.secondary.staked.eqn(94465)).to.be.true;
        expect(community.secondary.rewardDebt.eqn(897982)).to.be.true;
        expect(community.secondary.pendingReward.eqn(333902)).to.be.true;
    });
});

describe('Community without secondary', () => {
    const raw = Buffer.from([
        0x66, 0xec, 0xde, 0x60, 0x00, 0x00, 0x00, 0x00, 0x45, 0x8e, 0x52, 0xea,
        0x26, 0x4f, 0xc8, 0xa3, 0x72, 0xbe, 0xbf, 0x7d, 0x4f, 0xae, 0xbd, 0x33,
        0x6b, 0x8d, 0x88, 0xa9, 0x40, 0x4d, 0x59, 0xa0, 0x60, 0x84, 0xd8, 0xd9,
        0x2f, 0x7d, 0x33, 0x4c, 0xcf, 0x60, 0x6e, 0x82, 0xd1, 0x04, 0x9f, 0xf3,
        0x86, 0xd5, 0x06, 0x0c, 0xa6, 0xd4, 0x50, 0x8e, 0x01, 0x6b, 0x1a, 0x97,
        0x99, 0x4f, 0xfb, 0x65, 0xb0, 0x0a, 0xab, 0xf6, 0xa0, 0x8e, 0x51, 0xc7,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
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
        expect(community.secondary.isEmpty()).to.be.true;
        expect(community.secondary.authority).to.be.eql(
            new PublicKey('11111111111111111111111111111111')
        );
    });
});

describe('Stake', () => {
    const raw = Buffer.from([
        0xba, 0xd2, 0xde, 0x60, 0x00, 0x00, 0x00, 0x00, 0x57, 0x5c, 0x0c, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x06, 0xa4, 0x35, 0x69, 0xdd, 0x1a, 0x48, 0xfc,
        0x66, 0x0a, 0x36, 0x30, 0x5f, 0xf8, 0x0f, 0xff, 0xf1, 0xca, 0xaf, 0x48,
        0xe0, 0x87, 0x20, 0x94, 0xff, 0xa4, 0x61, 0x59, 0x20, 0x97, 0xa0, 0x32,
        0xf4, 0x8f, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0xaa, 0x57, 0xf6, 0x04,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x31, 0xf0, 0xde, 0x60, 0x00, 0x00, 0x00, 0x00, 0x67, 0x4a, 0x01, 0x00,
        0x00, 0x00, 0x00, 0x00
    ]);

    const stake: Stake = borsh.deserialize(Stake.schema, Stake, raw);

    it('should be equal', () => {
        expect(stake.creationDate).to.be.eql(
            new Date('2021-07-02 08:47:54.000+00')
        );

        expect(stake.totalStake.eqn(810071)).to.be.true;

        expect(stake.beneficiary.isEmpty()).to.be.false;
        expect(stake.beneficiary.authority).to.be.eql(
            new PublicKey('Svg3TsfzMNY8HbJzAYbVhGXeTJFwFfWbVirJSfyqPxd')
        );
        expect(stake.beneficiary.staked.eqn(364532)).to.be.true;
        expect(stake.beneficiary.rewardDebt.eq(new BN('83253162'))).to.be.true;
        expect(stake.beneficiary.pendingReward.eqn(0)).to.be.true;

        expect(stake.unbondingStart).to.be.eql(
            new Date('2021-07-02 10:53:37+00')
        );
        expect(stake.unbondingAmount.eqn(84583)).to.be.true;
    });

    it('should calculate right', () => {
        expect(
            stake.beneficiary
                .calculateReward(new BN('2607005792451633063128294278'))
                .eq(new BN('867083873'))
        ).to.be.true;
    });
});
*/
