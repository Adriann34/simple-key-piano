import React, { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import SheetMusic from './components/SheetMusic';
import VirtualKeyboard from './components/VirtualKeyboard';
import { parseMidiFile } from './utils/midiParser';
import { MidiData } from './types/midi';

interface NoteClickData {
  midiNotes: number[];
  clef: 'treble' | 'bass';
}

const App: React.FC = () => {
  const [midiData, setMidiData] = useState<MidiData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [highlightedKeys, setHighlightedKeys] = useState<number[]>([]);
  const [highlightedClef, setHighlightedClef] = useState<'treble' | 'bass'>('treble');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setFileName(file.name);
    
    try {
      const data = await parseMidiFile(file);
      setMidiData(data);
      
      // Show success message with detected information
      console.log('MIDI Analysis Complete:', {
        fileName: file.name,
       keySignature: `${data.keyName} ${data.keyMode}`,
       timeSignature: `${data.timeSignature.numerator}/${data.timeSignature.denominator}`,
       confidence: `${Math.round(data.confidence.key * 100)}%`,
       noteCount: data.notes.length
     });
   } catch (err) {
     setError('Failed to parse MIDI file. Please ensure it\'s a valid MIDI file with musical content.');
     console.error('MIDI parsing error:', err);
   } finally {
     setIsLoading(false);
   }
 }, []);

 const handleNoteClick = useCallback((data: NoteClickData) => {
   setHighlightedKeys(data.midiNotes);
   setHighlightedClef(data.clef);
   
   // Clear highlights after 4 seconds for better user experience
   setTimeout(() => {
     setHighlightedKeys([]);
   }, 4000);
 }, []);

 const handleKeyPress = useCallback((midiNote: number) => {
   setHighlightedKeys([midiNote]);
   setHighlightedClef(midiNote >= 60 ? 'treble' : 'bass');
   
   // Clear highlight after 2 seconds
   setTimeout(() => {
     setHighlightedKeys([]);
   }, 2000);
 }, []);

 return (
   <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
     <div className="container mx-auto px-4 py-8">
       <header className="text-center mb-8">
         <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
           Professional Piano Reading App
         </h1>
         <p className="text-lg text-gray-700 max-w-2xl mx-auto">
           Upload a MIDI file to generate professional sheet music with intelligent key detection, 
           proper voice separation, and interactive piano visualization
         </p>
       </header>

       {error && (
         <div className="max-w-3xl mx-auto mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700 rounded-r-lg">
           <div className="flex">
             <div className="ml-3">
               <p className="text-sm font-medium">Error Processing MIDI File</p>
               <p className="mt-1 text-sm">{error}</p>
             </div>
           </div>
         </div>
       )}

       {!midiData ? (
         <div className="max-w-2xl mx-auto">
           <FileUpload onFileUpload={handleFileUpload} isLoading={isLoading} />
           <div className="mt-8 text-center">
             <h3 className="text-xl font-semibold text-gray-800 mb-4">Professional Features</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
               <div className="bg-white p-4 rounded-lg shadow">
                 <h4 className="font-semibold text-blue-600 mb-2">🎼 Music Theory Intelligence</h4>
                 <p>Automatic key signature detection using Krumhansl-Schmuckler algorithm</p>
               </div>
               <div className="bg-white p-4 rounded-lg shadow">
                 <h4 className="font-semibold text-purple-600 mb-2">🎹 Professional Rendering</h4>
                 <p>VexFlow-powered sheet music with proper voice separation and beaming</p>
               </div>
               <div className="bg-white p-4 rounded-lg shadow">
                 <h4 className="font-semibold text-green-600 mb-2">🧠 Smart Processing</h4>
                 <p>Intelligent chord detection and musical context analysis</p>
               </div>
               <div className="bg-white p-4 rounded-lg shadow">
                 <h4 className="font-semibold text-indigo-600 mb-2">⚡ Interactive Learning</h4>
                 <p>Click sheet music notes to highlight corresponding piano keys</p>
               </div>
             </div>
           </div>
         </div>
       ) : (
         <div className="space-y-8">
           <div className="text-center">
             <button
               onClick={() => {
                 setMidiData(null);
                 setFileName('');
                 setHighlightedKeys([]);
                 setError(null);
               }}
               className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all duration-200 shadow-lg"
             >
               📁 Upload New File
             </button>
           </div>

           <SheetMusic midiData={midiData} onNoteClick={handleNoteClick} fileName={fileName} />

           <VirtualKeyboard 
             highlightedKeys={highlightedKeys}
             highlightedClef={highlightedClef}
             onKeyPress={handleKeyPress}
           />

           <div className="bg-white p-6 rounded-lg shadow-lg">
             <h3 className="text-lg font-semibold mb-4">📊 Musical Analysis</h3>
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
               <div className="bg-blue-50 p-3 rounded">
                 <span className="font-medium text-blue-700">Total Notes:</span>
                 <br />
                 <span className="text-lg font-bold text-blue-800">{midiData.notes.length}</span>
               </div>
               <div className="bg-purple-50 p-3 rounded">
                 <span className="font-medium text-purple-700">Key Signature:</span>
                 <br />
                 <span className="text-lg font-bold text-purple-800">{midiData.keyName} {midiData.keyMode}</span>
               </div>
               <div className="bg-green-50 p-3 rounded">
                 <span className="font-medium text-green-700">Time Signature:</span>
                 <br />
                 <span className="text-lg font-bold text-green-800">{midiData.timeSignature.numerator}/{midiData.timeSignature.denominator}</span>
               </div>
               <div className="bg-indigo-50 p-3 rounded">
                 <span className="font-medium text-indigo-700">Key Confidence:</span>
                 <br />
                 <span className="text-lg font-bold text-indigo-800">{Math.round(midiData.confidence.key * 100)}%</span>
               </div>
               <div className="bg-yellow-50 p-3 rounded">
                 <span className="font-medium text-yellow-700">Ticks/Quarter:</span>
                 <br />
                 <span className="text-lg font-bold text-yellow-800">{midiData.ticksPerQuarter}</span>
               </div>
               <div className="bg-red-50 p-3 rounded">
                 <span className="font-medium text-red-700">Tempo Changes:</span>
                 <br />
                 <span className="text-lg font-bold text-red-800">{midiData.tempoChanges.length}</span>
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