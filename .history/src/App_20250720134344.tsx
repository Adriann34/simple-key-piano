import React, { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import SheetMusic from './components/SheetMusic';
import VirtualKeyboard from './components/VirtualKeyboard';
import { parseMidiFile } from './utils/midiParser';
import { MidiData } from './types/midi';
import { getKeySignatureName, getTimeSignatureString } from './utils/noteMapping';

interface NoteClickData {
  midiNotes: number[];
  clef: 'treble' | 'bass';
}

const App: React.FC = () => {
  const [midiData, setMidiData] = useState<MidiData | null>(null);
  const [highlightedKeys, setHighlightedKeys] = useState<number[]>([]);
  const [highlightedClef, setHighlightedClef] = useState<'treble' | 'bass'>('treble');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await parseMidiFile(file);
      setMidiData(data);
    } catch (err) {
      setError('Failed to parse MIDI file. Please make sure it\'s a valid MIDI file.');
      console.error('MIDI parsing error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleNoteClick = useCallback((data: NoteClickData) => {
    setHighlightedKeys(data.midiNotes);
    setHighlightedClef(data.clef);
    
    // Clear highlights after 3 seconds
    setTimeout(() => {
      setHighlightedKeys([]);
    }, 3000);
  }, []);

  const handleKeyPress = useCallback((midiNote: number) => {
    setHighlightedKeys([midiNote]);
    setHighlightedClef(midiNote >= 60 ? 'treble' : 'bass');
    
    // Clear highlight after 1 second
    setTimeout(() => {
      setHighlightedKeys([]);
    }, 1000);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Piano Reading App
          </h1>
          <p className="text-gray-600">
            Upload a MIDI file to see sheet music and practice note reading
          </p>
        </header>

        {error && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {!midiData ? (
          <div className="max-w-2xl mx-auto">
            <FileUpload onFileUpload={handleFileUpload} isLoading={isLoading} />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center">
              <button
                onClick={() => {
                  setMidiData(null);
                  setHighlightedKeys([]);
                  setError(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Upload New File
              </button>
            </div>

            <SheetMusic midiData={midiData} onNoteClick={handleNoteClick} />

            <VirtualKeyboard 
              highlightedKeys={highlightedKeys}
              highlightedClef={highlightedClef}
              onKeyPress={handleKeyPress}
            />

            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Music Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Notes:</span>
                  <br />
                  {midiData.notes.length}
                </div>
                <div>
                  <span className="font-medium">Time Signature:</span>
                  <br />
                  {getTimeSignatureString(midiData.timeSignature.numerator, midiData.timeSignature.denominator)}
                </div>
                <div>
                  <span className="font-medium">Key Signature:</span>
                  <br />
                  {getKeySignatureName(midiData.keySignature)}
                </div>
                <div>
                  <span className="font-medium">Tempo:</span>
                  <br />
                  {midiData.tempo} BPM
                </div>
                <div>
                  <span className="font-medium">Ticks per Quarter:</span>
                  <br />
                  {midiData.ticksPerQuarter}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;