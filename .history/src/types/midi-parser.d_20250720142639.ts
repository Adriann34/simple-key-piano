declare module 'midi-parser-js' {
  interface MidiEvent {
    deltaTime: number;
    type: number;
    data?: number[];
  }

  interface MidiTrack {
    event: MidiEvent[];
  }

  interface MidiFile {
    timeDivision: number;
    track: MidiTrack[];
  }

  const MidiParser: {
    parse(data: Uint8Array): MidiFile;
  };

  export default MidiParser;
}