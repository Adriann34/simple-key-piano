// Updated midiParser.ts
import MidiParser from 'midi-parser-js';
import { MidiData, MidiNote } from '../types/midi';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Key signature mapping from sharps/flats to key names
const KEY_SIGNATURES = {
  '-7': 'Cb Major / Ab Minor',
  '-6': 'Gb Major / Eb Minor',
  '-5': 'Db Major / Bb Minor',
  '-4': 'Ab Major / F Minor',
  '-3': 'Eb Major / C Minor',
  '-2': 'Bb Major / G Minor',
  '-1': 'F Major / D Minor',
  '0': 'C Major / A Minor',
  '1': 'G Major / E Minor',
  '2': 'D Major / B Minor',
  '3': 'A Major / F# Minor',
  '4': 'E Major / C# Minor',
  '5': 'B Major / G# Minor',
  '6': 'F# Major / D# Minor',
  '7': 'C# Major / A# Minor'
};

export const parseMidiFile = (file: File): Promise<MidiData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        const midiData = MidiParser.parse(uint8Array);
        
        const notes: MidiNote[] = [];
        let currentTime = 0;
        const noteOnEvents: { [key: number]: { time: number; velocity: number; track: number } } = {};
        
        // Default values
        let timeSignature = { numerator: 4, denominator: 4 };
        let keySignature = 0;
        let keySignatureName = 'C Major / A Minor';
        let keySignatureMode = 0; // 0 = major, 1 = minor
        
        // Parse meta events from all tracks to find time/key signatures
        midiData.track.forEach((track, trackIndex) => {
          currentTime = 0;
          
          track.event.forEach((event) => {
            currentTime += event.deltaTime;
            
            // Meta event (0xFF)
            if (event.type === 255 && event.data && event.data.length >= 2) {
              const metaType = event.data[0];
              
              // Time Signature meta event (0x58)
              if (metaType === 0x58 && event.data.length >= 6) {
                const numerator = event.data[2];
                const denominator = Math.pow(2, event.data[3]); // denominator is stored as power of 2
                const clocksPerClick = event.data[4];
                const thirtySecondNotesPerQuarter = event.data[5];
                
                timeSignature = {
                  numerator: numerator,
                  denominator: denominator
                };
                
                console.log(`Found time signature: ${numerator}/${denominator}`);
              }
              
              // Key Signature meta event (0x59)
              else if (metaType === 0x59 && event.data.length >= 4) {
                const sf = event.data[2]; // signed byte for sharps/flats
                const mi = event.data[3]; // 0 = major, 1 = minor
                
                // Convert unsigned byte to signed
                const sharpsFlats = sf > 127 ? sf - 256 : sf;
                keySignature = sharpsFlats;
                keySignatureMode = mi;
                
                // Get the key name
                const keyName = KEY_SIGNATURES[sharpsFlats.toString() as keyof typeof KEY_SIGNATURES];
                if (keyName) {
                  const [major, minor] = keyName.split(' / ');
                  keySignatureName = mi === 0 ? major : minor;
                } else {
                  keySignatureName = `${Math.abs(sharpsFlats)} ${sharpsFlats < 0 ? 'flats' : 'sharps'}`;
                }
                
                console.log(`Found key signature: ${keySignatureName} (${sharpsFlats} ${sharpsFlats < 0 ? 'flats' : 'sharps'}, ${mi === 0 ? 'major' : 'minor'})`);
              }
            }
            
            // Note On (0x9_)
            else if (event.type === 9 && event.data && event.data.length >= 2) {
              const noteNumber = event.data[0];
              const velocity = event.data[1];
              
              if (velocity > 0) {
                noteOnEvents[noteNumber] = {
                  time: currentTime,
                  velocity,
                  track: trackIndex
                };
              } else {
                // Velocity 0 is treated as note off
                if (noteOnEvents[noteNumber]) {
                  const noteOn = noteOnEvents[noteNumber];
                  const duration = currentTime - noteOn.time;
                  
                  notes.push({
                    noteNumber,
                    noteName: getNoteName(noteNumber),
                    velocity: noteOn.velocity,
                    startTime: noteOn.time,
                    duration,
                    track: noteOn.track
                  });
                  
                  delete noteOnEvents[noteNumber];
                }
              }
            }
            
            // Note Off (0x8_)
            else if (event.type === 8 && event.data && event.data.length >= 2) {
              const noteNumber = event.data[0];
              
              if (noteOnEvents[noteNumber]) {
                const noteOn = noteOnEvents[noteNumber];
                const duration = currentTime - noteOn.time;
                
                notes.push({
                  noteNumber,
                  noteName: getNoteName(noteNumber),
                  velocity: noteOn.velocity,
                  startTime: noteOn.time,
                  duration,
                  track: noteOn.track
                });
                
                delete noteOnEvents[noteNumber];
              }
            }
          });
        });
        
        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);
        
        resolve({
          notes,
          ticksPerQuarter: midiData.timeDivision,
          timeSignature: timeSignature,
          keySignature: keySignature,
          keySignatureName: keySignatureName,
          keySignatureMode: keySignatureMode
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

const getNoteName = (noteNumber: number): string => {
  const octave = Math.floor(noteNumber / 12) - 1;
  const noteIndex = noteNumber % 12;
  return NOTE_NAMES[noteIndex] + octave;
};