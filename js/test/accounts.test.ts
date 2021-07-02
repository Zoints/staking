import { expect } from 'chai';
import { Settings } from '../src/accounts';
import 'mocha';
import * as borsh from 'borsh';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { BASE_REWARD } from '../src';

describe('Settings', () => {
    const raw = Buffer.from([
        0x05, 0xe5, 0xeb, 0x3d, 0x36, 0x5f, 0xbf, 0x21, 0x53, 0xee, 0xf0, 0xfc,
        0xcb, 0x32, 0x3a, 0x67, 0xf6, 0x47, 0xfa, 0xc4, 0xbe, 0x88, 0xfd, 0x5e,
        0x6c, 0x2f, 0x7a, 0xdf, 0xf6, 0xe0, 0x97, 0x1c, 0x3c, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xbf, 0x05, 0xc0, 0x62, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x28, 0x2e, 0x8c, 0xd1, 0x00, 0x00, 0x00, 0x0e, 0x6a, 0x0e, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x38, 0xf1, 0x5b, 0x1b, 0x10, 0xdd, 0xa8, 0x66,
        0xf8, 0xdc, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe4, 0xd3, 0xde, 0x60,
        0x00, 0x00, 0x00, 0x00
    ]);

    const settings: Settings = borsh.deserialize(
        Settings.schema,
        Settings,
        raw
    );
    it('should be equal', () => {
        expect(settings.token).to.eql(
            new PublicKey('Q2P36HbwEBwxTSj8QhiMscbA21vBi7edJKbsb9KjBRM')
        );

        expect(settings.unbondingTime.eqn(60)).to.be.true;
        expect(settings.nextEmissionChange).to.eql(
            new Date('2022-07-02 08:45:51.000+00')
        );

        expect(settings.emission.eq(BASE_REWARD)).to.be.true;
        expect(settings.totalStake.eqn(944654)).to.be.true;
        expect(settings.rewardPerShare.eq(new BN('9505983553469455343022392')))
            .to.be.true;
        expect(settings.lastReward).to.eql(
            new Date('2021-07-02 08:52:52.000+00')
        );
    });

    it('should calculate', () => {
        expect(
            // one day
            settings
                .calculateRewardPerShare(new Date('2021-07-03 08:45:51.000+00'))
                .eq(new BN('2607005792451633063128294278'))
        ).to.be.true;
        expect(
            // one year
            settings
                .calculateRewardPerShare(new Date('2022-07-02 08:45:51.000+00'))
                .eq(new BN('952726569754857408885174220678'))
        ).to.be.true;
        expect(
            // one year one month
            settings
                .calculateRewardPerShare(new Date('2022-08-02 08:45:51.000+00'))
                .eq(new BN('1013414151793664920665017779078'))
        ).to.be.true;
    });
});
