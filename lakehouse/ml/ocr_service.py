"""
OCR Document Processing Service
Extracts text from land registry documents (title deeds, surveys, certificates)
"""

import os
import io
import json
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import pytesseract
from PIL import Image
import cv2
import numpy as np
import requests
from pdf2image import convert_from_path, convert_from_bytes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OCRService:
    """Service for extracting text from land registry documents"""
    
    def __init__(self, tesseract_path: Optional[str] = None):
        """
        Initialize OCR service
        
        Args:
            tesseract_path: Path to Tesseract executable (optional)
        """
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
        
        # Supported file formats
        self.supported_formats = {
            'image': ['.jpg', '.jpeg', '.png', '.tiff', '.bmp'],
            'pdf': ['.pdf']
        }
        
        logger.info("OCR Service initialized")
    
    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """
        Preprocess image for better OCR accuracy
        
        Args:
            image: Input image as numpy array
            
        Returns:
            Preprocessed image
        """
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        
        # Denoise
        denoised = cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)
        
        # Deskew
        coords = np.column_stack(np.where(denoised > 0))
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        
        (h, w) = denoised.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            denoised, M, (w, h),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
        
        return rotated
    
    def extract_text_from_image(
        self, 
        image_path: str, 
        preprocess: bool = True,
        lang: str = 'eng'
    ) -> Dict:
        """
        Extract text from image file
        
        Args:
            image_path: Path to image file
            preprocess: Whether to preprocess image
            lang: Tesseract language code
            
        Returns:
            Dictionary with extracted text and metadata
        """
        try:
            # Read image
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not read image: {image_path}")
            
            # Preprocess if requested
            if preprocess:
                image = self.preprocess_image(image)
            
            # Extract text
            text = pytesseract.image_to_string(image, lang=lang)
            
            # Get detailed data with bounding boxes
            data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
            
            # Calculate confidence
            confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            
            return {
                'text': text.strip(),
                'confidence': round(avg_confidence, 2),
                'word_count': len(text.split()),
                'char_count': len(text),
                'language': lang,
                'processed_at': datetime.utcnow().isoformat(),
                'bounding_boxes': self._extract_bounding_boxes(data)
            }
            
        except Exception as e:
            logger.error(f"Error extracting text from image: {str(e)}")
            raise
    
    def extract_text_from_pdf(
        self, 
        pdf_path: str, 
        preprocess: bool = True,
        lang: str = 'eng'
    ) -> Dict:
        """
        Extract text from PDF file
        
        Args:
            pdf_path: Path to PDF file
            preprocess: Whether to preprocess images
            lang: Tesseract language code
            
        Returns:
            Dictionary with extracted text and metadata per page
        """
        try:
            # Convert PDF to images
            images = convert_from_path(pdf_path, dpi=300)
            
            results = []
            full_text = []
            total_confidence = 0
            
            for page_num, pil_image in enumerate(images, start=1):
                # Convert PIL image to numpy array
                image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
                
                # Preprocess if requested
                if preprocess:
                    image = self.preprocess_image(image)
                
                # Extract text
                text = pytesseract.image_to_string(image, lang=lang)
                
                # Get confidence
                data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
                confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
                page_confidence = sum(confidences) / len(confidences) if confidences else 0
                
                results.append({
                    'page': page_num,
                    'text': text.strip(),
                    'confidence': round(page_confidence, 2),
                    'word_count': len(text.split()),
                    'bounding_boxes': self._extract_bounding_boxes(data)
                })
                
                full_text.append(text.strip())
                total_confidence += page_confidence
            
            avg_confidence = total_confidence / len(images) if images else 0
            
            return {
                'full_text': '\n\n'.join(full_text),
                'pages': results,
                'page_count': len(images),
                'average_confidence': round(avg_confidence, 2),
                'language': lang,
                'processed_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {str(e)}")
            raise
    
    def extract_text_from_url(
        self, 
        url: str, 
        preprocess: bool = True,
        lang: str = 'eng'
    ) -> Dict:
        """
        Extract text from image or PDF URL
        
        Args:
            url: URL to document
            preprocess: Whether to preprocess
            lang: Tesseract language code
            
        Returns:
            Dictionary with extracted text and metadata
        """
        try:
            # Download file
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Determine file type
            content_type = response.headers.get('content-type', '').lower()
            
            if 'pdf' in content_type:
                # Convert PDF bytes to images
                images = convert_from_bytes(response.content, dpi=300)
                
                results = []
                full_text = []
                total_confidence = 0
                
                for page_num, pil_image in enumerate(images, start=1):
                    image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
                    
                    if preprocess:
                        image = self.preprocess_image(image)
                    
                    text = pytesseract.image_to_string(image, lang=lang)
                    data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
                    confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
                    page_confidence = sum(confidences) / len(confidences) if confidences else 0
                    
                    results.append({
                        'page': page_num,
                        'text': text.strip(),
                        'confidence': round(page_confidence, 2)
                    })
                    
                    full_text.append(text.strip())
                    total_confidence += page_confidence
                
                avg_confidence = total_confidence / len(images) if images else 0
                
                return {
                    'full_text': '\n\n'.join(full_text),
                    'pages': results,
                    'page_count': len(images),
                    'average_confidence': round(avg_confidence, 2),
                    'language': lang,
                    'processed_at': datetime.utcnow().isoformat()
                }
            else:
                # Process as image
                image = Image.open(io.BytesIO(response.content))
                image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                
                if preprocess:
                    image_np = self.preprocess_image(image_np)
                
                text = pytesseract.image_to_string(image_np, lang=lang)
                data = pytesseract.image_to_data(image_np, lang=lang, output_type=pytesseract.Output.DICT)
                confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
                avg_confidence = sum(confidences) / len(confidences) if confidences else 0
                
                return {
                    'text': text.strip(),
                    'confidence': round(avg_confidence, 2),
                    'word_count': len(text.split()),
                    'language': lang,
                    'processed_at': datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Error extracting text from URL: {str(e)}")
            raise
    
    def extract_structured_data(self, text: str, document_type: str) -> Dict:
        """
        Extract structured data from OCR text based on document type
        
        Args:
            text: Extracted text
            document_type: Type of document (title_deed, survey, certificate)
            
        Returns:
            Dictionary with structured data
        """
        import re
        
        structured_data = {
            'document_type': document_type,
            'extracted_fields': {}
        }
        
        if document_type == 'title_deed':
            # Extract title number
            title_match = re.search(r'Title\s+(?:Number|No\.?)[\s:]+([A-Z0-9-]+)', text, re.IGNORECASE)
            if title_match:
                structured_data['extracted_fields']['title_number'] = title_match.group(1)
            
            # Extract owner name
            owner_match = re.search(r'Owner[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', text, re.IGNORECASE)
            if owner_match:
                structured_data['extracted_fields']['owner_name'] = owner_match.group(1)
            
            # Extract parcel ID
            parcel_match = re.search(r'Parcel\s+(?:ID|Number)[\s:]+([A-Z0-9-]+)', text, re.IGNORECASE)
            if parcel_match:
                structured_data['extracted_fields']['parcel_id'] = parcel_match.group(1)
            
            # Extract area/size
            area_match = re.search(r'(?:Area|Size)[\s:]+(\d+(?:\.\d+)?)\s*(sq\.?m|hectares?|acres?)', text, re.IGNORECASE)
            if area_match:
                structured_data['extracted_fields']['area'] = area_match.group(1)
                structured_data['extracted_fields']['area_unit'] = area_match.group(2)
        
        elif document_type == 'survey':
            # Extract survey number
            survey_match = re.search(r'Survey\s+(?:Number|No\.?)[\s:]+([A-Z0-9-]+)', text, re.IGNORECASE)
            if survey_match:
                structured_data['extracted_fields']['survey_number'] = survey_match.group(1)
            
            # Extract coordinates
            coord_pattern = r'(\d+°\s*\d+\'\s*\d+(?:\.\d+)?\"?\s*[NS])\s*[,\s]+(\d+°\s*\d+\'\s*\d+(?:\.\d+)?\"?\s*[EW])'
            coords = re.findall(coord_pattern, text)
            if coords:
                structured_data['extracted_fields']['coordinates'] = coords
        
        return structured_data
    
    def _extract_bounding_boxes(self, data: Dict) -> List[Dict]:
        """Extract bounding box data for detected text"""
        boxes = []
        n_boxes = len(data['text'])
        
        for i in range(n_boxes):
            if int(data['conf'][i]) > 0:  # Only include confident detections
                boxes.append({
                    'text': data['text'][i],
                    'x': data['left'][i],
                    'y': data['top'][i],
                    'width': data['width'][i],
                    'height': data['height'][i],
                    'confidence': int(data['conf'][i])
                })
        
        return boxes


def main():
    """Example usage"""
    ocr = OCRService()
    
    # Example: Process a title deed image
    result = ocr.extract_text_from_image(
        'path/to/title_deed.jpg',
        preprocess=True,
        lang='eng'
    )
    
    print(f"Extracted text ({result['confidence']}% confidence):")
    print(result['text'])
    
    # Extract structured data
    structured = ocr.extract_structured_data(result['text'], 'title_deed')
    print("\nStructured data:")
    print(json.dumps(structured, indent=2))


if __name__ == '__main__':
    main()
