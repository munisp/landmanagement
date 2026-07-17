import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  X, 
  FileText, 
  Image as ImageIcon, 
  File,
  CheckCircle2,
  AlertCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface DocumentUploadProps {
  parcelId?: number;
  transactionId?: number;
  onUploadComplete?: (documents: UploadedDocument[]) => void;
  maxFiles?: number;
  acceptedTypes?: string[];
}

interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
}

interface FileWithPreview extends File {
  preview?: string;
}

export default function DocumentUpload({
  parcelId,
  transactionId,
  onUploadComplete,
  maxFiles = 10,
  acceptedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
}: DocumentUploadProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragActive, setDragActive] = useState(false);

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: (data, variables) => {
      const fileName = variables.fileName;
      setUploadProgress(prev => ({ ...prev, [fileName]: 100 }));
      toast.success(`${fileName} uploaded successfully`);
    },
    onError: (error, variables) => {
      const fileName = variables.fileName;
      toast.error(`Failed to upload ${fileName}: ${error.message}`);
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[fileName];
        return newProgress;
      });
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return `File type ${file.type} is not supported`;
    }
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return `File size exceeds 50MB limit`;
    }
    return null;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, [files, maxFiles]);

  const handleFiles = (newFiles: File[]) => {
    if (files.length + newFiles.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const validFiles: FileWithPreview[] = [];
    
    for (const file of newFiles) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        continue;
      }

      const fileWithPreview = file as FileWithPreview;
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        fileWithPreview.preview = URL.createObjectURL(file);
      }
      
      validFiles.push(fileWithPreview);
    }

    setFiles(prev => [...prev, ...validFiles]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      const file = newFiles[index];
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    setUploading(true);

    try {
      for (const file of files) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        // Read file as base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Simulate upload progress
        for (let i = 0; i <= 90; i += 10) {
          setUploadProgress(prev => ({ ...prev, [file.name]: i }));
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Upload to S3 first (in real implementation)
        const fileKey = `documents/${Date.now()}-${file.name}`;
        const fileUrl = `https://storage.example.com/${fileKey}`; // Mock URL
        
        await uploadMutation.mutateAsync({
          type: file.type.startsWith('image/') ? 'image' : 'document',
          title: file.name,
          fileName: file.name,
          fileKey,
          fileUrl,
          fileSize: file.size,
          mimeType: file.type,
          parcelId,
          transactionId,
        });
      }

      // Clear files after successful upload
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      setFiles([]);
      setUploadProgress({});
      
      if (onUploadComplete) {
        onUploadComplete([]);
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon;
    if (type === 'application/pdf') return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />
        
        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        
        <h3 className="text-lg font-semibold mb-2">
          Drop files here or click to browse
        </h3>
        
        <p className="text-sm text-muted-foreground mb-4">
          Supported formats: PDF, JPG, PNG, DOC, DOCX (Max 50MB per file)
        </p>
        
        <label htmlFor="file-upload">
          <Button type="button" variant="outline" asChild>
            <span>Select Files</span>
          </Button>
        </label>
        
        <p className="text-xs text-muted-foreground mt-2">
          {files.length} / {maxFiles} files selected
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Selected Files</h4>
          
          {files.map((file, index) => {
            const Icon = getFileIcon(file.type);
            const progress = uploadProgress[file.name];
            const isUploading = progress !== undefined && progress < 100;
            const isComplete = progress === 100;

            return (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Preview or Icon */}
                    <div className="flex-shrink-0">
                      {file.preview ? (
                        <img
                          src={file.preview}
                          alt={file.name}
                          className="w-16 h-16 object-cover rounded"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                          <Icon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </p>
                        </div>

                        {!uploading && !isComplete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="flex-shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}

                        {isComplete && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                        )}
                      </div>

                      {/* Upload Progress */}
                      {isUploading && (
                        <div className="mt-2">
                          <Progress value={progress} className="h-1" />
                          <p className="text-xs text-muted-foreground mt-1">
                            Uploading... {progress}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload Button */}
      {files.length > 0 && !uploading && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              files.forEach(file => {
                if (file.preview) {
                  URL.revokeObjectURL(file.preview);
                }
              });
              setFiles([]);
            }}
          >
            Clear All
          </Button>
          <Button onClick={uploadFiles} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {files.length} {files.length === 1 ? 'File' : 'Files'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
