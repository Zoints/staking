import { PublicKey } from '@solana/web3.js';
import { BinaryReader, BinaryWriter } from 'borsh';
import { Authority, AuthorityType } from '.';
declare module 'borsh' {
    interface BinaryWriter {
        writeBigInt(value: bigint): void;
        writePublicKey(value: PublicKey): void;
        writeDate(value: Date): void;
        writeAuthority(value: Authority): void;
    }
    interface BinaryReader {
        readBigInt(): bigint;
        readPublicKey(): PublicKey;
        readDate(): Date;
        readAuthority(): Authority;
    }
}

BinaryWriter.prototype.writeBigInt = function (value: bigint) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(value);
    this.writeFixedArray(buf);
};

BinaryReader.prototype.readBigInt = function () {
    const buf = Buffer.from(this.readFixedArray(8));
    return buf.readBigInt64LE();
};

BinaryWriter.prototype.writePublicKey = function (value: PublicKey) {
    this.writeFixedArray(value.toBuffer());
};

BinaryReader.prototype.readPublicKey = function () {
    return new PublicKey(this.readFixedArray(32));
};

BinaryWriter.prototype.writeDate = function (value: Date) {
    this.writeU64(value.getUnixTime());
};

BinaryReader.prototype.readDate = function () {
    return new Date(this.readU64().toNumber() * 1000);
};

BinaryWriter.prototype.writeAuthority = function (value: Authority) {
    this.writeU8(value.authorityType);
    switch (value.authorityType) {
        case AuthorityType.Basic: // fallthrough on purpose
        case AuthorityType.NFT:
            this.writePublicKey(value.address);
            break;
        default:
            throw new Error('unknown AuthorityType');
    }
};

BinaryReader.prototype.readAuthority = function () {
    const authorityType = this.readU8();
    switch (authorityType) {
        case AuthorityType.Basic: // fallthrough on purpose
        case AuthorityType.NFT:
            return new Authority({
                authorityType,
                address: this.readPublicKey()
            });
        default:
            throw new Error('unknown AuthorityType');
    }
};
