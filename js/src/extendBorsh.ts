import { BinaryWriter } from 'borsh';
declare module 'borsh' {
    interface BinaryWriter {
        writeI64(value: bigint): void;
    }
}

BinaryWriter.prototype.writeI64 = function (value: bigint) {
    this.maybeResize();
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64LE(value);

    // this is a hacky copy-paste of BinaryWriter.writeBuffer
    // since that function is private for some reason
    this.buf = Buffer.concat([
        Buffer.from(this.buf.subarray(0, this.length)),
        buffer,
        Buffer.alloc(1024)
    ]);
    this.length += buffer.length;
};
