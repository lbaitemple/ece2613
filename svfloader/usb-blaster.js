// USB Blaster protocol implementation (works with both USB-Blaster I and II)
export class USBBlasterII {
    constructor() {
        this.device = null;
        this.interface = null;
        this.endpointIn = null;
        this.endpointOut = null;

    // USB Blaster VID/PID (original USB-Blaster, not II)
    this.VENDOR_ID = 0x09FB;  // Altera
    this.PRODUCT_ID = 0x6001;  // USB-Blaster (DE10-lite uses original, not II)
    }

    async connect() {
        try {
            this.device = await navigator.usb.requestDevice({
                filters: [{ vendorId: this.VENDOR_ID }]
            });

            await this.device.open();

            if (this.device.configuration === null) {
                await this.device.selectConfiguration(1);
            }

            await this.device.claimInterface(0);
            this.interface = this.device.configuration.interfaces[0];

            const alternate = this.interface.alternates[0];
            this.endpointOut = alternate.endpoints.find(e => e.direction === 'out');
            this.endpointIn = alternate.endpoints.find(e => e.direction === 'in');

            if (!this.endpointOut || !this.endpointIn) {
                throw new Error('Could not find required endpoints');
            }

            console.log('USB Blaster connected (original, not II)');
            console.log('Endpoint OUT:', this.endpointOut.endpointNumber);
            console.log('Endpoint IN:', this.endpointIn.endpointNumber);

            // Initialize JTAG MESSP protocol
            await this.initMESSP();

            return true;
        } catch (error) {
            throw new Error(`USB connection failed: ${error.message}`);
        }
    }

    async disconnect() {
        if (this.device) {
            await this.device.close();
            this.device = null;
        }
    }

    async initMESSP() {
        // FTDI-style USB Blaster protocol initialization
        // Based on openFPGALoader's UsbBlasterI initialization
        console.log('Initializing USB Blaster protocol...');
        
        // FTDI control transfer request codes
        const SIO_RESET = 0x00;           // Reset the port
        const SIO_SET_LATENCY = 0x09;     // Set latency timer
        const SIO_SET_BITMODE = 0x0B;     // Set bitmode
        const SIO_RESET_PURGE_RX = 0x01;  // Purge RX buffer
        const SIO_RESET_PURGE_TX = 0x02;  // Purge TX buffer
        
        try {
            // 1. Reset the FTDI device (equivalent to ftdi_usb_reset)
            await this.device.controlTransferOut({
                requestType: 'vendor',
                recipient: 'device',
                request: SIO_RESET,
                value: 0,  // SIO_RESET_SIO
                index: 0
            });
            console.log('FTDI reset complete');
        } catch (e) {
            console.warn('FTDI reset failed (may not be critical):', e.message);
        }
        
        try {
            // 2. Purge RX buffer
            await this.device.controlTransferOut({
                requestType: 'vendor',
                recipient: 'device',
                request: SIO_RESET,
                value: SIO_RESET_PURGE_RX,
                index: 0
            });
        } catch (e) {
            console.warn('Purge RX failed:', e.message);
        }
        
        try {
            // 3. Purge TX buffer  
            await this.device.controlTransferOut({
                requestType: 'vendor',
                recipient: 'device',
                request: SIO_RESET,
                value: SIO_RESET_PURGE_TX,
                index: 0
            });
        } catch (e) {
            console.warn('Purge TX failed:', e.message);
        }
        
        try {
            // 4. Set latency timer to 2ms (like openFPGALoader)
            await this.device.controlTransferOut({
                requestType: 'vendor',
                recipient: 'device',
                request: SIO_SET_LATENCY,
                value: 2,  // 2ms latency
                index: 0
            });
            console.log('Latency timer set to 2ms');
        } catch (e) {
            console.warn('Set latency timer failed:', e.message);
        }
        
        // 5. Drain any pending data from RX buffer
        for (let i = 0; i < 10; i++) {
            try {
                const result = await this.device.transferIn(this.endpointIn.endpointNumber, 64);
                if (result.data.byteLength <= 2) break; // Only status bytes or empty
            } catch (e) {
                break; // No more data or error
            }
        }

        // 6. Flush internal buffer by sending JTAG reset (TMS=1 for many clocks)
        // This ensures the FPGA's JTAG TAP is in a known state
        const base = 0x2C;
        const flushSize = 4096;
        const flushBuf = new Uint8Array(flushSize);
        for (let i = 0; i < flushSize; i += 2) {
            flushBuf[i] = base | 0x02;     // TMS=1, TCK=0
            flushBuf[i+1] = base | 0x03;   // TMS=1, TCK=1
        }
        
        try {
            await this.sendCommand(flushBuf);
            console.log('Sent flush sequence');
        } catch (e) {
            console.warn('Flush sequence failed:', e.message);
        }
        
        console.log('USB Blaster protocol ready');
    }

    async sendCommand(data) {
        if (!this.device) {
            throw new Error('Device not connected');
        }

        try {
            // Add a timeout race to detect stalls - use shorter timeout
            const transferPromise = this.device.transferOut(this.endpointOut.endpointNumber, data);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('USB transfer timed out')), 2000)
            );
            
            await Promise.race([transferPromise, timeoutPromise]);
        } catch (error) {
            console.error(`USB Send failed: ${error.message}`);
            throw new Error(`Send command failed: ${error.message}`);
        }
    }

    async readResponse(length = 64) {
        if (!this.device) {
            throw new Error('Device not connected');
        }

        try {
            // Request more bytes to account for FTDI 2-byte status header
            const result = await this.device.transferIn(
                this.endpointIn.endpointNumber,
                length + 2
            );
            const data = new Uint8Array(result.data.buffer);
            
            // FTDI FT245 returns 2-byte modem/line status prefix (e.g., 0x31 0x60)
            // Skip the first 2 bytes to get actual data
            if (data.length >= 2) {
                return data.slice(2);
            }
            return data;
        } catch (error) {
            throw new Error(`Read response failed: ${error.message}`);
        }
    }

    /**
     * Optimized byte-based shifting for large transfers.
     * Sends all bytes except last using byte-shift mode, then last byte bit-by-bit
     * with TMS=1 on the final bit to exit shift state.
     */
    async shiftBytes(tdiBytes, bitLength) {
        if (!this.device) {
            throw new Error('Device not connected');
        }

        const numBytes = Math.ceil(bitLength / 8);
        const bitsInLastByte = bitLength % 8 || 8;
        
        // Only log for very large transfers
        if (bitLength > 1000000) {
            console.log(`shiftBytes: ${bitLength} bits (${numBytes} bytes)`);
        }

        // Shift all complete bytes except possibly the last one using byte-shift mode
        // We need at least 8 bits remaining to use byte-shift
        const bytesToShiftFast = numBytes > 1 ? numBytes - 1 : 0;
        
        if (bytesToShiftFast > 0) {
            await this.shiftBytesRaw(tdiBytes, 0, bytesToShiftFast);
        }

        // Handle the last byte(s) bit-by-bit since we need TMS=1 on final bit
        // Like openFPGALoader: send all bits with TMS=0 in one batch, then last bit with TMS=1 separately
        const lastByteStart = bytesToShiftFast;
        const remainingBits = bitLength - (bytesToShiftFast * 8);
        const base = 0x2C;
        
        // First, send all bits except the last with TMS=0
        if (remainingBits > 1) {
            const dataBytes = [];
            for (let i = 0; i < remainingBits - 1; i++) {
                const byteIdx = lastByteStart + Math.floor(i / 8);
                const bitIdx = i % 8;
                const tdi = (tdiBytes[byteIdx] >> bitIdx) & 1;
                
                const setupByte = base | (tdi << 4) | 0;  // TMS=0, TCK=0
                const clockByte = base | (tdi << 4) | 1;  // TMS=0, TCK=1
                dataBytes.push(setupByte, clockByte);
            }
            await this.sendCommand(new Uint8Array(dataBytes));
        }
        
        // Then send the last bit with TMS=1 to exit shift state
        {
            const i = remainingBits - 1;
            const byteIdx = lastByteStart + Math.floor(i / 8);
            const bitIdx = i % 8;
            const tdi = (tdiBytes[byteIdx] >> bitIdx) & 1;
            
            const setupByte = base | (tdi << 4) | 0x02;  // TMS=1, TCK=0
            const clockByte = base | (tdi << 4) | 0x03;  // TMS=1, TCK=1
            await this.sendCommand(new Uint8Array([setupByte, clockByte]));
        }

        return null;  // No capture
    }

    /**
     * Raw byte-shift without any bit-banging. Used for the bulk of the data.
     * OPTIMIZED: Batches multiple byte-shift commands into larger USB packets.
     */
    async shiftBytesRaw(tdiBytes, startByte, numBytes) {
        const MAX_BYTES_PER_CMD = 63;
        const MAX_USB_PACKET = 4096;  // Larger USB packet for efficiency
        const base = 0x2C;
        
        // Send bit-bang setup first
        await this.device.transferOut(this.endpointOut.endpointNumber, new Uint8Array([base]));
        
        const startTime = Date.now();
        let byteOffset = 0;
        
        // Pre-allocate a large buffer for batching
        const batchBuffer = new Uint8Array(MAX_USB_PACKET);
        
        while (byteOffset < numBytes) {
            let batchPos = 0;
            
            // Fill the batch buffer with multiple byte-shift commands
            while (byteOffset < numBytes && batchPos < MAX_USB_PACKET - 64) {
                const bytesInThisPacket = Math.min(MAX_BYTES_PER_CMD, numBytes - byteOffset);
                const cmdByte = 0x80 | (bytesInThisPacket & 0x3f);
                
                batchBuffer[batchPos++] = cmdByte;
                
                // Copy data bytes
                for (let i = 0; i < bytesInThisPacket; i++) {
                    batchBuffer[batchPos++] = tdiBytes[startByte + byteOffset + i];
                }
                
                byteOffset += bytesInThisPacket;
            }
            
            // Send the batch
            await this.device.transferOut(this.endpointOut.endpointNumber, batchBuffer.slice(0, batchPos));
            
            // Drain buffer less frequently - every 32KB
            if (byteOffset > 0 && (byteOffset % 32768) === 0) {
                try {
                    await Promise.race([
                        this.device.transferIn(this.endpointIn.endpointNumber, 64),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10))
                    ]);
                } catch (e) { /* ignore */ }
            }
        }
        
        // Log only for large transfers
        if (numBytes > 100000) {
            const elapsed = Date.now() - startTime;
            console.log(`shiftBytesRaw: ${numBytes} bytes in ${elapsed}ms (${(numBytes * 1000 / elapsed / 1024).toFixed(1)} KB/s)`);
        }
    }

    /**
     * Toggle TCK for a given number of cycles with TMS=0, TDI=0
     * Used for RUNTEST command - OPTIMIZED for speed
     */
    async toggleClockCycles(cycles) {
        if (!this.device || cycles <= 0) return;

        const base = 0x2C;
        await this.device.transferOut(this.endpointOut.endpointNumber, new Uint8Array([base]));
        
        const numBytes = Math.ceil(cycles / 8);
        
        // Reuse static zero buffer for common sizes
        if (!this._zeroBuffer || this._zeroBuffer.length < numBytes) {
            this._zeroBuffer = new Uint8Array(Math.max(numBytes, 65536));
        }
        
        await this.shiftBytesRaw(this._zeroBuffer, 0, numBytes);
    }

    async shiftBits(tdiBits, tmsBits, bitLength, capture = false) {
        if (!this.device) {
            throw new Error('Device not connected');
        }

        // For small transfers (state navigation, etc), use efficient bit-bang
        // Build all command bytes first, then send in one transfer
        let bitIndex = 0;
        const resultBits = capture ? [] : null;
        
        while (bitIndex < bitLength) {
            const canUseByteshiftMode = !capture && this.canUseByteshiftMode(tmsBits, bitIndex, bitLength);
            
            // Lower threshold for byte-shift (16 bits instead of 64)
            if (canUseByteshiftMode && (bitLength - bitIndex) >= 16) {
                const remainingBits = bitLength - bitIndex;
                const bytesToShift = Math.floor(remainingBits / 8);
                const bitsToShift = bytesToShift * 8;
                await this.shiftBytewise(tdiBits, bitIndex, bitsToShift);
                bitIndex += bitsToShift;
            } else {
                // Batch more bits at once (64 instead of 32)
                const batchSize = Math.min(64, bitLength - bitIndex);
                const batchTdo = await this.shiftBitBang(tdiBits, tmsBits, bitIndex, batchSize, capture);
                if (capture && batchTdo) {
                    resultBits.push(...batchTdo);
                }
                bitIndex += batchSize;
            }
        }
        
        if (capture) {
            // Pack bits into Uint8Array
            const numBytes = Math.ceil(bitLength / 8);
            const result = new Uint8Array(numBytes);
            for (let i = 0; i < bitLength; i++) {
                if (resultBits[i]) {
                    const byteIdx = Math.floor(i / 8);
                    const bitIdx = i % 8;
                    result[byteIdx] |= (1 << bitIdx);
                }
            }
            return result;
        }
        return null;
    }
    
    async shiftBitBang(tdiBits, tmsBits, startIndex, bitCount, capture) {
        // Bit-bang mode: send 2 bytes per bit (setup + clock)
        // OPTIMIZED: Pre-allocate buffer, send all at once
        const tdoBits = capture ? [] : null;
        
        // Pre-allocate buffer for all bytes
        const allBytes = new Uint8Array(bitCount * 2);
        let pos = 0;
        
        for (let i = 0; i < bitCount; i++) {
            const bitIdx = startIndex + i;
            const tdi = (tdiBits && tdiBits[bitIdx]) ? 0x10 : 0;
            const tms = (tmsBits && tmsBits[bitIdx]) ? 0x02 : 0;
            
            const base = 0x2C | tdi | tms;
            allBytes[pos++] = base;           // TCK=0
            allBytes[pos++] = base | 0x01 | (capture ? 0x40 : 0);  // TCK=1
        }
        
        // Send all bytes in one transfer (up to 4KB)
        await this.device.transferOut(this.endpointOut.endpointNumber, allBytes);
        
        // If capturing, wait a bit then read all responses
        if (capture) {
            // Give FT245 time to process and buffer responses
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // FT245 returns: 2-byte header + 1 byte per read command
            // Each bit with read-enable set generates 1 response byte
            const expectedBytes = bitCount;
            
            try {
                // Read in chunks, FT245 may not return all at once
                let totalRead = [];
                let retries = 10;
                
                while (totalRead.length < expectedBytes && retries > 0) {
                    try {
                        const response = await this.readResponse(Math.min(64, expectedBytes - totalRead.length + 2));
                        if (response.length > 0) {
                            totalRead.push(...response);
                        }
                        if (response.length === 0) {
                            // No more data, wait a bit and try again
                            await new Promise(resolve => setTimeout(resolve, 5));
                            retries--;
                        }
                    } catch (e) {
                        // Read failed, wait and retry
                        await new Promise(resolve => setTimeout(resolve, 5));
                        retries--;
                    }
                }
                
                // Debug first response
                if (this.debugReadCount < 5) {
                    console.log(`Read ${totalRead.length} bytes (expected ${expectedBytes}):`, 
                        totalRead.slice(0, 16).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                    this.debugReadCount = (this.debugReadCount || 0) + 1;
                }

                // Extract TDO bits (Bit 0 of each byte)
                for (let j = 0; j < Math.min(totalRead.length, expectedBytes); j++) {
                    tdoBits.push(totalRead[j] & 0x01);
                }
                
                // Fill remaining with zeros if we didn't get enough
                while (tdoBits.length < bitCount) {
                    tdoBits.push(0);
                }
            } catch (e) {
                console.warn('Read response failed:', e.message);
                // Fill with zeros if read fails
                for (let j = 0; j < bitCount; j++) tdoBits.push(0);
            }
        }
        
        return tdoBits;
    }
    
    canUseByteshiftMode(tmsBits, startIndex, totalLength) {
        // Check if next 8 bits all have TMS=0 (minimum for byte-shift mode)
        if (!tmsBits) return true;  // If no TMS array, assume all zeros
        
        const checkLength = Math.min(8, totalLength - startIndex);
        for (let i = 0; i < checkLength; i++) {
            if (tmsBits[startIndex + i]) {
                return false;  // Found TMS=1
            }
        }
        return true;
    }
    
    async shiftBytewise(tdiBits, startBit, bitCount) {
        // USB-Blaster byte-shift mode: 0x80 | (num_bytes - 1)
        // openFPGALoader uses a 64-byte internal buffer and flushes at 64 bytes
        // Each command: [0x80 | (N-1), N bytes of TDI data] where N <= 63
        // 
        // CRITICAL: The FT245 internal TX buffer is only 128 bytes!
        // We need to pace our writes and allow time for the device to process
        
        const MAX_BYTES_PER_CMD = 63; // Max data bytes per command
        const numBytes = Math.ceil(bitCount / 8);
        
        // Debug first packet
        let isFirstPacket = true;
        
        // Progress tracking
        let totalSent = 0;
        const startTime = Date.now();
        
        for (let byteOffset = 0; byteOffset < numBytes; byteOffset += MAX_BYTES_PER_CMD) {
            const bytesInThisPacket = Math.min(MAX_BYTES_PER_CMD, numBytes - byteOffset);
            
            // Build command byte: 0x80 | num_bytes (NOT num_bytes - 1!)
            // openFPGALoader uses tx_len directly: mask | (tx_len & 0x3f)
            const cmdByte = 0x80 | (bytesInThisPacket & 0x3f);
            
            // Pack TDI data into bytes (8 bits per byte, LSB-first within each byte)
            const tdiBytes = new Uint8Array(bytesInThisPacket);
            for (let i = 0; i < bytesInThisPacket; i++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const bitIdx = startBit + (byteOffset + i) * 8 + bit;
                    if (bitIdx >= startBit + bitCount) break;
                    if (tdiBits && tdiBits[bitIdx]) {
                        byte |= (1 << bit);
                    }
                }
                tdiBytes[i] = byte;
            }
            
            // Debug first packet
            if (isFirstPacket && bitCount > 1000) {
                console.log(`shiftBytewise: cmd=0x${cmdByte.toString(16)}, ${bytesInThisPacket} bytes, total ${numBytes} bytes`);
                console.log(`  First 10 bytes: ${Array.from(tdiBytes.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
                isFirstPacket = false;
            }
            
            // Send: [cmd, data bytes]
            const packet = new Uint8Array(1 + bytesInThisPacket);
            packet[0] = cmdByte;
            packet.set(tdiBytes, 1);
            
            // Direct write without timeout wrapper for speed
            await this.device.transferOut(this.endpointOut.endpointNumber, packet);
            totalSent += packet.length;
            
            // CRITICAL: Drain and pace every packet to avoid buffer overflow
            // The FT245 can stall if we write faster than it can process
            if (byteOffset > 0 && (byteOffset % (MAX_BYTES_PER_CMD * 2)) === 0) {
                // Try to read any buffered data
                try {
                    const result = await Promise.race([
                        this.device.transferIn(this.endpointIn.endpointNumber, 64),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50))
                    ]);
                } catch (e) {
                    // Timeout is fine
                }
            }
        }
        
        // Log completion
        if (numBytes > 1000) {
            const elapsed = Date.now() - startTime;
            console.log(`shiftBytewise complete: ${numBytes} bytes in ${elapsed}ms (${(numBytes * 1000 / elapsed / 1024).toFixed(1)} KB/s)`);
        }
    }
    
    async shiftSingleBit(tdi, tms, capture) {
        // USB Blaster protocol bit-bang mode
        // Bit 0: TCK
        // Bit 1: TMS  
        // Bit 4: TDI
        // Bit 6: Read mode (1 = read TDO)
        
        const base = 0x2C;
        let cmd = base;
        if (tms) cmd |= 0x02;  // Bit 1: TMS
        if (tdi) cmd |= 0x10;  // Bit 4: TDI
        
        // Setup (TCK=0)
        const setupByte = cmd;
        
        // Clock (TCK=1)
        let clockByte = cmd | 0x01;
        if (capture) clockByte |= 0x40; // Bit 6: Read mode
        
        const buffer = new Uint8Array([setupByte, clockByte]);
        await this.sendCommand(buffer);
        
        if (capture) {
            try {
                const response = await this.readResponse(1);
                // In read mode, TDO comes back in bit 0
                // The response should be 1 byte per read
                const tdoBit = response[0] & 0x01;
                return tdoBit;
            } catch (error) {
                console.warn('TDO read error:', error.message);
                return 0;
            }
        }
        return 0;
    }
    
    async shiftChunkBatch(tdiBits, tmsBits, offset, length) {
        // Batch shift without reading TDO (faster)
        const buffer = [];
        const base = 0x2C;
        
        for (let i = 0; i < length; i++) {
            const tdi = (tdiBits && tdiBits[offset + i]) ? 1 : 0;
            const tms = (tmsBits && tmsBits[offset + i]) ? 1 : 0;
            
            let cmd = base;
            if (tms) cmd |= 0x02;
            if (tdi) cmd |= 0x10;
            
            buffer.push(cmd, cmd | 0x01);
        }
        
        await this.sendCommand(new Uint8Array(buffer));
    }

    async shiftChunk(tdiBits, tmsBits, offset, length, capture) {
        // OpenFPGALoader-style USB Blaster protocol
        // Shift bits and read TDO responses
        
        const tdoBytes = [];
        const base = 0x2C;
        
        // Process each bit
        for (let i = 0; i < length; i++) {
            const tdi = (tdiBits && tdiBits[offset + i]) ? 1 : 0;
            const tms = (tmsBits && tmsBits[offset + i]) ? 1 : 0;
            
            // USB Blaster legacy protocol bit-bang byte format:
            // Bit 0: TCK (clock)
            // Bit 1: TMS
            // Bit 4: TDI
            // Bit 5: Read TDO
            // Bit 6: Shift mode (0 for bit-bang)
            
            // Build command: clock low with data
            let cmd = base;
            if (tms) cmd |= 0x02;  // TMS
            if (tdi) cmd |= 0x10;  // TDI
            
            // Send: clock low, then clock high
            let clockByte = cmd | 0x01;
            if (capture) clockByte |= 0x40; // Read enable (Bit 6)
            
            const buffer = new Uint8Array([cmd, clockByte]);
            await this.sendCommand(buffer);
            
            // Read TDO if capturing
            if (capture) {
                try {
                    const response = await this.readResponse(1);
                    // TDO is in bit 0 of the response byte
                    tdoBytes.push(response[0] & 0x01);
                } catch (error) {
                    tdoBytes.push(0);
                }
            }
        }

        if (!capture) {
            return null;
        }

        // Pack TDO bits into bytes
        const numBytes = Math.ceil(length / 8);
        const result = new Uint8Array(numBytes);
        for (let i = 0; i < length; i++) {
            const byteIdx = Math.floor(i / 8);
            const bitIdx = i % 8;
            if (tdoBytes[i]) {
                result[byteIdx] |= (1 << bitIdx);
            }
        }
        
        return result;
    }
}
