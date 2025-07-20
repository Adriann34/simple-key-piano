import React, { useCallback } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, isLoading }) => {
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'audio/midi') {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'audio/midi') {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <div className="text-4xl">🎵</div>
          <div>
            <p className="text-lg font-medium text-gray-700">
              {isLoading ? 'Processing...' : 'Upload MIDI File'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Drag and drop or click to select
            </p>
          </div>
          <input
            type="file"
            accept=".mid,.midi"
            onChange={handleFileChange}
            className="hidden"
            id="midi-upload"
            disabled={isLoading}
          />
          <label
            htmlFor="midi-upload"
            className={`inline-block px-4 py-2 bg-blue-500 text-white rounded-md cursor-pointer hover:bg-blue-600 transition-colors ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Processing...' : 'Choose File'}
          </label>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;