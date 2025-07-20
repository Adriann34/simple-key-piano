import React from 'react';
import { isBlackKey } from '../utils/noteMapping';

interface VirtualKeyboardProps {
  highlightedKeys: number[];
  highlightedClef?: 'treble' | 'bass';
  onKeyPress?: (midiNote: number) => void;
}

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  highlightedKeys,
  highlightedClef = 'treble',
  onKeyPress
}) => {
  const getNoteName = (midiNote: number): string => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = noteNames[midiNote % 12];
    return `${noteName}${octave}`;
  };

  const getWhiteKeyPosition = (midiNote: number): number => {
    const whiteKeysBefore = getWhiteKeysBefore(midiNote);
    const whiteKeyWidth = 28;
    return whiteKeysBefore * whiteKeyWidth;
  };

  const getBlackKeyPosition = (midiNote: number): number => {
    const whiteKeyWidth = 28;
    const blackKeyWidth = 18;
    
    // Count white keys before this note to get the base position
    let whiteKeysBefore = 0;
    for (let note = 21; note < midiNote; note++) {
      if (!isBlackKey(note)) {
        whiteKeysBefore++;
      }
    }
    
    // Get the note within its octave (C=0, C#=1, D=2, etc.)
    const noteInOctave = midiNote % 12;
    
    // Calculate position based on white keys and specific black key offset
    let position = whiteKeysBefore * whiteKeyWidth;
    
    // Adjust for the specific black key position within the white key pattern
    switch (noteInOctave) {
      case 1: // C#
        position = position - (blackKeyWidth / 2);
        break;
      case 3: // D#
        position = position - (blackKeyWidth / 2);
        break;
      case 6: // F#
        position = position - (blackKeyWidth / 2);
        break;
      case 8: // G#
        position = position - (blackKeyWidth / 2);
        break;
      case 10: // A#
        position = position - (blackKeyWidth / 2);
        break;
    }
    
    return position;
  };

  const getWhiteKeysBefore = (midiNote: number): number => {
    let count = 0;
    for (let note = 21; note < midiNote; note++) {
      if (!isBlackKey(note)) {
        count++;
      }
    }
    return count;
  };

  const getHighlightColor = (isBlack: boolean, isHighlighted: boolean, clef: string) => {
    if (!isHighlighted) {
      return isBlack 
        ? 'bg-gray-900 hover:bg-gray-800' 
        : 'bg-white hover:bg-gray-50';
    }
    
    if (clef === 'treble') {
      return isBlack 
        ? 'bg-green-500 border-green-700 shadow-lg' 
        : 'bg-green-400 border-green-500 shadow-lg';
    } else {
      return isBlack 
        ? 'bg-blue-500 border-blue-700 shadow-lg' 
        : 'bg-blue-400 border-blue-500 shadow-lg';
    }
  };

  const renderKeys = () => {
    const keys = [];
    const whiteKeys = [];
    const blackKeys = [];
    
    for (let midiNote = 21; midiNote <= 108; midiNote++) {
      const isBlack = isBlackKey(midiNote);
      const isHighlighted = highlightedKeys.includes(midiNote);
      const noteName = getNoteName(midiNote);
      
      if (isBlack) {
        blackKeys.push(
          <button
            key={midiNote}
            className={`piano-key black absolute w-[18px] h-16 border border-gray-800 rounded-b-sm transition-all duration-200 ${
              getHighlightColor(true, isHighlighted, highlightedClef)
            } ${isHighlighted ? 'transform scale-110 z-10' : ''}`}
            style={{
              left: `${getBlackKeyPosition(midiNote)}px`,
              zIndex: isHighlighted ? 10 : 2,
            }}
            onClick={() => onKeyPress?.(midiNote)}
            title={noteName}
          />
        );
      } else {
        whiteKeys.push(
          <button
            key={midiNote}
            className={`piano-key white w-7 h-24 border border-gray-300 transition-all duration-200 flex items-end justify-center pb-1 text-xs ${
              getHighlightColor(false, isHighlighted, highlightedClef)
            } ${isHighlighted ? 'transform scale-105 z-10' : ''}`}
            style={{
              left: `${getWhiteKeyPosition(midiNote)}px`,
              position: 'absolute',
              zIndex: isHighlighted ? 10 : 1,
            }}
            onClick={() => onKeyPress?.(midiNote)}
            title={noteName}
          >
            <span className={`text-gray-500 ${isHighlighted ? (highlightedClef === 'treble' ? 'text-green-800' : 'text-blue-800') + ' font-semibold' : ''}`}>
              {noteName}
            </span>
          </button>
        );
      }
    }
    
    return [...whiteKeys, ...blackKeys];
  };

  const totalWhiteKeys = getWhiteKeysBefore(109);
  const totalWidth = totalWhiteKeys * 28;

  // Sort highlighted keys by pitch (ascending order)
  const sortedHighlightedKeys = [...highlightedKeys].sort((a, b) => a - b);

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      <h3 className="text-lg font-semibold mb-4">Virtual Piano</h3>
      <div className="overflow-x-auto border rounded-lg bg-gray-100 p-4">
        <div 
          className="relative"
          style={{ width: `${totalWidth}px`, height: '100px' }}
        >
          {renderKeys()}
        </div>
      </div>
      <div className="mt-4 text-sm text-gray-600">
        <p>
          {highlightedKeys.length > 0 && (
            <>
              <span className="font-semibold">Highlighted notes ({highlightedClef} clef):</span>{' '}
              {sortedHighlightedKeys.map(note => getNoteName(note)).join(', ')}
            </>
          )}
          {highlightedKeys.length === 0 && 'Click on sheet music notes to highlight keys'}
        </p>
        <p className="mt-1">
          Green keys = Right hand (Treble clef) • Blue keys = Left hand (Bass clef)
        </p>
      </div>
    </div>
  );
};

export default VirtualKeyboard;