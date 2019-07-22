import "regenerator-runtime/runtime";
import {Znp, ZpiObject} from '../src/znp';
import SerialPort from 'serialport';
import {Frame as UnpiFrame, Constants as UnpiConstants} from '../src/unpi';

const mockSerialPortClose = jest.fn().mockImplementation((cb) => cb ? cb() : null);
const mockSerialPortFlush = jest.fn().mockImplementation((cb) => cb());
const mockSerialPortPipe = jest.fn();
const mockSerialPortOpen = jest.fn().mockImplementation((cb) => cb());
const mockSerialPortConstructor = jest.fn();
const mockSerialPortOnce = jest.fn();
const mockSerialPortWrite = jest.fn((buffer, cb) => cb());

jest.mock('../src/utils', () => {
    return {
        wait: jest.fn(),
    };
});

jest.mock('serialport', () => {
    return jest.fn().mockImplementation(() => {
        return {
            close: mockSerialPortClose,
            constructor: mockSerialPortConstructor,
            emit: () => {},
            on: () => {},
            once: mockSerialPortOnce,
            open: mockSerialPortOpen,
            pipe: mockSerialPortPipe,
            write: mockSerialPortWrite,
            flush: mockSerialPortFlush,
        };
    });
});

const mockUnpiParserOn = jest.fn();

jest.mock('../src/unpi/parser', () => {
    return jest.fn().mockImplementation(() => {
        return {
            on: mockUnpiParserOn,
        };
    });
});

const mockUnpiWriterWriteFrame = jest.fn();
const mockUnpiWriterWriteBuffer = jest.fn();

jest.mock('../src/unpi/writer', () => {
    return jest.fn().mockImplementation(() => {
        return {
            writeFrame: mockUnpiWriterWriteFrame,
            writeBuffer: mockUnpiWriterWriteBuffer,
            pipe: jest.fn(),
        };
    });
});

const mocks = [
    mockSerialPortClose, mockSerialPortPipe, mockSerialPortConstructor, mockSerialPortOpen,
    mockSerialPortOnce, mockSerialPortWrite, SerialPort, mockUnpiParserOn, mockUnpiWriterWriteFrame,
    mockUnpiWriterWriteBuffer, mockSerialPortFlush,
];

describe('ZNP', () => {
    let znp;

    beforeEach(() => {
        for (let mock of mocks) {
            // @ts-ignore
            mock.mockClear();
        }

        // @ts-ignore; make sure we always get a new instance
        znp = new Znp();
    });

    it('Open', async () => {
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        expect(SerialPort).toHaveBeenCalledTimes(1);
        expect(SerialPort).toHaveBeenCalledWith(
            "/dev/ttyACM0",
            {"autoOpen": false, "baudRate": 100, "rtscts": true},
        );

        expect(mockSerialPortPipe).toHaveBeenCalledTimes(1);
        expect(mockSerialPortOpen).toHaveBeenCalledTimes(1);
        expect(mockUnpiWriterWriteBuffer).toHaveBeenCalledTimes(1);
        expect(mockSerialPortOnce).toHaveBeenCalledTimes(2);
    });

    it('Open with error', async () => {
        mockSerialPortOpen.mockImplementationOnce((cb) => cb('failed!'));

        let error = false;

        try {
            await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        } catch (e) {
            error = e;
        }

        expect(SerialPort).toHaveBeenCalledTimes(1);
        expect(SerialPort).toHaveBeenCalledWith(
            "/dev/ttyACM0",
            {"autoOpen": false, "baudRate": 100, "rtscts": true},
        );

        expect(error).toEqual(new Error("Error while opening serialport 'failed!'"));
        expect(mockSerialPortPipe).toHaveBeenCalledTimes(1);
        expect(mockSerialPortOpen).toHaveBeenCalledTimes(1);
        expect(mockUnpiWriterWriteBuffer).toHaveBeenCalledTimes(0);
        expect(mockSerialPortOnce).toHaveBeenCalledTimes(0);
    });

    it('Open and close', async () => {
        const close = jest.fn();
        znp.on('close', close);
        expect(znp.isInitialized()).toBeFalsy();
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        expect(znp.isInitialized()).toBeTruthy();
        await znp.close();
        expect(znp.isInitialized()).toBeFalsy();

        expect(mockSerialPortFlush).toHaveBeenCalledTimes(1);
        expect(mockSerialPortClose).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('Open and close error', async () => {
        const close = jest.fn();
        znp.on('close', close);
        mockSerialPortClose.mockImplementationOnce((cb) => cb("failed!"));
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        let error;
        try {
            await znp.close();
        } catch (e) {
            error = e;
        }

        expect(mockSerialPortFlush).toHaveBeenCalledTimes(1);
        expect(mockSerialPortClose).toHaveBeenCalledTimes(1);
        expect(error).toStrictEqual(new Error("Error while closing serialport 'failed!'"));
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('Close without initialization', async () => {
        const close = jest.fn();
        znp.on('close', close);
        mockSerialPortClose.mockImplementationOnce((cb) => cb("failed!"));
        await znp.close();

        expect(mockSerialPortFlush).toHaveBeenCalledTimes(0);
        expect(mockSerialPortClose).toHaveBeenCalledTimes(0);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('Open and close by serialport event', async () => {
        let closeCb;

        mockSerialPortOnce.mockImplementation(((event, cb) => {
            if (event === 'close') {
                closeCb = cb;
            }
        }));

        const close = jest.fn();
        znp.on('close', close);
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        closeCb();

        expect(close).toHaveBeenCalledTimes(1);
    });

    it('Serialport error (do nothing)', async () => {
        let errorCb;

        mockSerialPortOnce.mockImplementation(((event, cb) => {
            if (event === 'error') {
                errorCb = cb;
            }
        }));

        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        errorCb();
    });

    it('UnpiParser error (do nothing)', async () => {
        let errorCb;

        mockUnpiParserOn.mockImplementation(((event, cb) => {
            if (event === 'error') {
                errorCb = cb;
            }
        }));

        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        errorCb();
    });

    it('znp receive', async () => {
        let parsedCb;
        const received = jest.fn();

        znp.on('received', received);

        mockUnpiParserOn.mockImplementationOnce((event, cb) => {
            if (event === 'parsed') {
                parsedCb = cb;
            }
        });

        znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        parsedCb(new UnpiFrame(
            UnpiConstants.Type.SRSP,
            UnpiConstants.Subsystem.SYS,
            0x02,
            Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x01, 0x01, 0x01, 0x01])
        ));

        expect(received).toHaveBeenCalledTimes(1);

        const obj = received.mock.calls[0][0];
        expect(obj.command).toBe('version');
        expect(obj.commandID).toBe(2);
        expect(obj.payload).toStrictEqual({"maintrel": 5, "majorrel": 3, "minorrel": 4, "product": 2, "revision": 16843009, "transportrev": 1});
        expect(obj.subsystem).toBe(UnpiConstants.Subsystem.SYS);
        expect(obj.type).toBe(UnpiConstants.Type.SRSP);
    });

    it('znp receive malformed', async () => {
        let parsedCb;
        const received = jest.fn();

        znp.on('received', received);

        mockUnpiParserOn.mockImplementationOnce((event, cb) => {
            if (event === 'parsed') {
                parsedCb = cb;
            }
        });

        znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        parsedCb(new UnpiFrame(
            UnpiConstants.Type.SRSP,
            UnpiConstants.Subsystem.SYS,
            0x02,
            Buffer.from([0x01, 0x02, 0x03, 0x04])
        ));

        expect(received).toHaveBeenCalledTimes(0);
    });

    it('znp request SREQ', async () => {
        let parsedCb;
        mockUnpiParserOn.mockImplementationOnce((event, cb) => {
            if (event === 'parsed') {
                parsedCb = cb;
            }
        });

        mockUnpiWriterWriteFrame.mockImplementationOnce(() => {
            parsedCb(new UnpiFrame(
                UnpiConstants.Type.SRSP,
                UnpiConstants.Subsystem.SYS,
                0x08,
                Buffer.from([0x00, 0x02, 0x01, 0x02])
            ));
        });

        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        const result = await znp.request(UnpiConstants.Subsystem.SYS, 'osalNvRead', {id: 1, offset: 2});

        const frame = mockUnpiWriterWriteFrame.mock.calls[0][0];
        expect(mockUnpiWriterWriteFrame).toHaveBeenCalledTimes(1);
        expect(frame.commandID).toBe(8);
        expect(frame.subsystem).toBe(UnpiConstants.Subsystem.SYS);
        expect(frame.type).toBe(UnpiConstants.Type.SREQ);
        expect(frame.data).toStrictEqual(Buffer.from([0x01, 0x00, 0x02]));

        expect(result.command).toBe('osalNvRead');
        expect(result.commandID).toBe(0x08);
        expect(result.payload).toStrictEqual({status: 0, len: 2, value: Buffer.from([0x01, 0x02])});
        expect(result.subsystem).toBe(UnpiConstants.Subsystem.SYS);
        expect(result.type).toBe(UnpiConstants.Type.SRSP);
    });

    it('znp request SREQ with parsed in between', async () => {
        let parsedCb;
        mockUnpiParserOn.mockImplementationOnce((event, cb) => {
            if (event === 'parsed') {
                parsedCb = cb;
            }
        });

        mockUnpiWriterWriteFrame.mockImplementationOnce(() => {
            parsedCb(new UnpiFrame(
                UnpiConstants.Type.SRSP,
                UnpiConstants.Subsystem.AF,
                0x00,
                Buffer.from([0x00])
            ));

            parsedCb(new UnpiFrame(
                UnpiConstants.Type.SRSP,
                UnpiConstants.Subsystem.SYS,
                0x08,
                Buffer.from([0x00, 0x02, 0x01, 0x02])
            ));
        });

        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        const result = await znp.request(UnpiConstants.Subsystem.SYS, 'osalNvRead', {id: 1, offset: 2});

        const frame = mockUnpiWriterWriteFrame.mock.calls[0][0];
        expect(mockUnpiWriterWriteFrame).toHaveBeenCalledTimes(1);
        expect(frame.commandID).toBe(8);
        expect(frame.subsystem).toBe(UnpiConstants.Subsystem.SYS);
        expect(frame.type).toBe(UnpiConstants.Type.SREQ);
        expect(frame.data).toStrictEqual(Buffer.from([0x01, 0x00, 0x02]));

        expect(result.command).toBe('osalNvRead');
        expect(result.commandID).toBe(0x08);
        expect(result.payload).toStrictEqual({status: 0, len: 2, value: Buffer.from([0x01, 0x02])});
        expect(result.subsystem).toBe(UnpiConstants.Subsystem.SYS);
        expect(result.type).toBe(UnpiConstants.Type.SRSP);
    });

    it('znp request AREQ reset', async () => {
        let parsedCb;
        mockUnpiParserOn.mockImplementationOnce((event, cb) => {
            if (event === 'parsed') {
                parsedCb = cb;
            }
        });

        mockUnpiWriterWriteFrame.mockImplementationOnce(() => {
            parsedCb(new UnpiFrame(
                UnpiConstants.Type.AREQ,
                UnpiConstants.Subsystem.SYS,
                0x80,
                Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06])
            ));
        });

        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        const result = await znp.request(UnpiConstants.Subsystem.SYS, 'resetReq', {type: 1});

        const frame = mockUnpiWriterWriteFrame.mock.calls[0][0];
        expect(mockUnpiWriterWriteFrame).toHaveBeenCalledTimes(1);
        expect(frame.commandID).toBe(0);
        expect(frame.subsystem).toBe(UnpiConstants.Subsystem.SYS);
        expect(frame.type).toBe(UnpiConstants.Type.AREQ);
        expect(frame.data).toStrictEqual(Buffer.from([1]));

        expect(result.command).toBe('resetInd');
        expect(result.commandID).toBe(0x80);
        expect(result.payload).toStrictEqual({reason: 1, transportrev: 2, productid: 3, majorrel: 4, minorrel: 5, hwrev: 6});
        expect(result.subsystem).toBe(UnpiConstants.Subsystem.SYS);
        expect(result.type).toBe(UnpiConstants.Type.AREQ);
    });

    it('znp request AREQ', async () => {
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        const result = await znp.request(UnpiConstants.Subsystem.SAPI, 'startConfirm', {status: 1});

        const frame = mockUnpiWriterWriteFrame.mock.calls[0][0];
        expect(mockUnpiWriterWriteFrame).toHaveBeenCalledTimes(1);
        expect(frame.commandID).toBe(128);
        expect(frame.subsystem).toBe(UnpiConstants.Subsystem.SAPI);
        expect(frame.type).toBe(UnpiConstants.Type.AREQ);
        expect(frame.data).toStrictEqual(Buffer.from([1]));

        expect(result).toBe(undefined);
    });

    it('znp request without init', async () => {
        let error;

        try {
            await znp.request(UnpiConstants.Subsystem.SAPI, 'startConfirm', {status: 1});
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(new Error("Cannot request when znp has not been initialized yet"));
    });


    it('znp request with non-existing subsystem', async () => {
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        let error;

        try {
            await znp.request(999, 'startConfirm', {status: 1});
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(new Error("Subsystem '999' does not exist"));
    });

    it('znp request with non-existing cmd', async () => {
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});
        let error;

        try {
            await znp.request(UnpiConstants.Subsystem.SAPI, 'nonExisting', {status: 1});
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(new Error("Command 'nonExisting' from subsystem '6' not found"));
    });

    it('return same instance', async () => {
        const instance1 = Znp.getInstance();
        const instance2 = Znp.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('znp request timeout', async () => {
        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        jest.useFakeTimers();
        let result = znp.request(UnpiConstants.Subsystem.SYS, 'osalNvRead', {id: 1, offset: 2});
        jest.runAllTimers();

        let error;
        try {
            result = await result;
        } catch (e) {
            error = e;
        }

        expect(error).toStrictEqual(new Error("timeout"));
    });

    it('znp request, responses comes after timeout', async () => {
        let parsedCb;
        mockUnpiParserOn.mockImplementationOnce((event, cb) => {
            if (event === 'parsed') {
                parsedCb = cb;
            }
        });

        await znp.open("/dev/ttyACM0", {baudRate: 100, rtscts: true});

        jest.useFakeTimers();
        let result = znp.request(UnpiConstants.Subsystem.SYS, 'osalNvRead', {id: 1, offset: 2});
        jest.runAllTimers();

        parsedCb(new UnpiFrame(
            UnpiConstants.Type.SRSP,
            UnpiConstants.Subsystem.SYS,
            0x08,
            Buffer.from([0x00, 0x02, 0x01, 0x02])
        ));

        let error;
        try {
            result = await result;
        } catch (e) {
            error = e;
        }

        expect(error).toStrictEqual(new Error("timeout"));
    });

    it('ZpiObject throw error on missing write parser', async () => {
        // @ts-ignore; make sure we always get a new instance
        const obj = new ZpiObject(0, 0, 'dummy', 0, {}, [{name: 'nonExisting', parameterType: 9999999}]);
        expect(() => {
            obj.createPayloadBuffer();
        }).toThrow();
    });

    it('ZpiObject throw error on unknown command', async () => {
        // @ts-ignore; make sure we always get a new instance
        const frame = new UnpiFrame(UnpiConstants.Type.SREQ, UnpiConstants.Subsystem.AF, 99999, Buffer.alloc(0));
        expect(() => {
            ZpiObject.fromUnpiFrame(frame);
        }).toThrow();
    });

    it('ZpiObject throw error on unknown parameters', async () => {
        // @ts-ignore; make sure we always get a new instance
        const frame = new UnpiFrame(UnpiConstants.Type.SRSP, UnpiConstants.Subsystem.AF, 128, Buffer.alloc(0));
        expect(() => {
            ZpiObject.fromUnpiFrame(frame);
        }).toThrow();
    });

    it('ZpiObject with cmd and non sapi is not reset command', async () => {
        // @ts-ignore; make sure we always get a new instance
        const obj = new ZpiObject(UnpiConstants.Type.SREQ, UnpiConstants.Subsystem.AF, 'systemReset', 0, {}, []);
        expect(obj.isResetCommand()).toBeFalsy();
    });

    it('ZpiObject with assoc dev list', async () => {
        const buffer = Buffer.from([
            0x00,
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x01, 0x01,
            0x00,
            0x02,
            0x10, 0x10,
            0x11, 0x11,
        ]);

        const frame = new UnpiFrame(UnpiConstants.Type.AREQ, UnpiConstants.Subsystem.ZDO, 128, buffer);
        const obj = ZpiObject.fromUnpiFrame(frame);
        expect(obj.payload).toStrictEqual({
            assocdevlist: [4112, 4369],
            ieeeaddr: "0x0807060504030201",
            numassocdev: 2,
            nwkaddr: 257,
            startindex: 0,
            status: 0,

        });
    });
});