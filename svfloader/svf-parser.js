// SVF (Serial Vector Format) parser
export class SVFParser {
    parse(svfText) {
        const commands = [];
        const lines = svfText.split('\n');
        
        let currentCommand = '';
        let lineCount = 0;
        
        for (let line of lines) {
            lineCount++;
            // Remove comments
            line = line.split('!')[0].trim();
            if (!line) continue;

            currentCommand += ' ' + line;

            // Commands end with semicolon
            if (line.endsWith(';')) {
                const trimmed = currentCommand.trim();
                const cmd = this.parseCommand(trimmed);
                if (cmd) commands.push(cmd);
                currentCommand = '';
            }
        }
        
        return commands;
    }
    
    parseCommand(cmdText) {
        // Remove trailing semicolon
        cmdText = cmdText.replace(/;$/, '').trim();
        
        // Pre-process: remove whitespace inside parentheses to keep hex data together
        // This handles multi-line hex data in SVF files
        cmdText = cmdText.replace(/\(([^)]*)\)/g, (match, content) => {
            return '(' + content.replace(/\s+/g, '') + ')';
        });
        
        const tokens = cmdText.split(/\s+/);
        const cmdName = tokens[0].toUpperCase();
        
        switch (cmdName) {
            case 'STATE':
                return this.parseState(tokens);
            case 'SIR':
            case 'SDR':
                return this.parseShift(cmdName, tokens);
            case 'RUNTEST':
                return this.parseRunTest(tokens);
            case 'FREQUENCY':
                return this.parseFrequency(tokens);
            case 'TRST':
                return this.parseTRST(tokens);
            case 'ENDIR':
            case 'ENDDR':
                return this.parseEnd(cmdName, tokens);
            default:
                return { type: cmdName, raw: cmdText };
        }
    }
    
    parseState(tokens) {
        return {
            type: 'STATE',
            states: tokens.slice(1)
        };
    }
    
    parseShift(type, tokens) {
        const cmd = { type };
        let rawTdi = null;
        let rawTdo = null;
        let rawMask = null;
        let rawSMask = null;
        
        for (let i = 1; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Only set length once from the first numeric token
            if (!isNaN(token) && !cmd.length) {
                cmd.length = parseInt(token);
            } else if (token.startsWith('TDI')) {
                // TDI could be "TDI" followed by "(hex)" or "TDI(hex)"
                if (token === 'TDI') {
                    rawTdi = tokens[++i];
                } else {
                    rawTdi = token.substring(3); // Remove 'TDI' prefix
                }
            } else if (token.startsWith('TDO')) {
                if (token === 'TDO') {
                    rawTdo = tokens[++i];
                } else {
                    rawTdo = token.substring(3);
                }
            } else if (token.startsWith('MASK')) {
                if (token === 'MASK') {
                    rawMask = tokens[++i];
                } else {
                    rawMask = token.substring(4);
                }
            } else if (token.startsWith('SMASK')) {
                if (token === 'SMASK') {
                    rawSMask = tokens[++i];
                } else {
                    rawSMask = token.substring(5);
                }
            }
        }

        const bitLength = cmd.length || 0;
        if (rawTdi) cmd.tdi = this.parseHexData(rawTdi, bitLength);
        if (rawTdo) cmd.tdo = this.parseHexData(rawTdo, bitLength);
        if (rawMask) cmd.mask = this.parseHexData(rawMask, bitLength);
        if (rawSMask) cmd.smask = this.parseHexData(rawSMask, bitLength);
        
        return cmd;
    }
    
    parseRunTest(tokens) {
        let runState = null;
        let endState = null;
        let cycles = 0;

        for (let i = 1; i < tokens.length; i++) {
            const token = tokens[i].toUpperCase();

            if (!isNaN(tokens[i])) {
                cycles = parseInt(tokens[i], 10) || 0;
            } else if (token === 'TCK' || token === 'SEC' || token === 'USEC' || token === 'MSEC') {
                continue;
            } else if (token === 'ENDSTATE') {
                const nextToken = tokens[++i];
                if (nextToken) {
                    endState = nextToken.toUpperCase();
                }
            } else {
                runState = token;
            }
        }

        const resolvedRunState = (runState || 'IDLE').toUpperCase();
        const resolvedEndState = (endState || resolvedRunState).toUpperCase();
        return {
            type: 'RUNTEST',
            cycles,
            state: resolvedRunState,
            endState: resolvedEndState
        };
    }
    
    parseFrequency(tokens) {
        return {
            type: 'FREQUENCY',
            frequency: parseFloat(tokens[1]) || 0
        };
    }
    
    parseTRST(tokens) {
        return {
            type: 'TRST',
            mode: tokens[1]
        };
    }
    
    parseEnd(type, tokens) {
        return {
            type,
            state: tokens[1]
        };
    }
    
    parseHexData(hexToken, bitLength = 0) {
        if (!hexToken) return null;

        let hexStr = hexToken
            .replace(/[()]/g, '')
            .replace(/\s+/g, '')
            .toUpperCase();

        if (hexStr.length === 0) {
            return new Uint8Array(Math.ceil(bitLength / 8));
        }

        if (hexStr.length % 2 !== 0) {
            hexStr = '0' + hexStr;
        }

        const providedBytes = hexStr.length / 2;
        const targetBytes = Math.ceil(bitLength / 8);
        const byteLength = Math.max(providedBytes, targetBytes);
        const bytes = new Uint8Array(byteLength);

        // Read from END of string to BEGINNING (LSB first)
        for (let i = 0; i < providedBytes; i++) {
            const hexIndex = hexStr.length - 2 - (i * 2);
            const pair = hexStr.slice(hexIndex, hexIndex + 2);
            bytes[i] = parseInt(pair, 16) || 0;
        }

        return bytes;
    }
}
