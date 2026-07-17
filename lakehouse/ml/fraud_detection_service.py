"""
Fraud Detection Service
Detects anomalies and potential fraud in land registry transactions
"""

import os
import json
import logging
import pickle
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FraudDetectionService:
    """Service for detecting fraudulent land registry transactions"""
    
    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize fraud detection service
        
        Args:
            model_path: Path to pre-trained model (optional)
        """
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = []
        self.model_path = model_path or 'models/fraud_detector.pkl'
        
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)
        else:
            logger.info("No pre-trained model found. Will train on first use.")
        
        logger.info("Fraud Detection Service initialized")
    
    def extract_features(self, transaction: Dict) -> np.ndarray:
        """
        Extract features from transaction data
        
        Args:
            transaction: Transaction dictionary
            
        Returns:
            Feature vector as numpy array
        """
        features = []
        
        # Transaction amount features
        amount = transaction.get('amount', 0)
        features.append(amount)
        features.append(np.log1p(amount))  # Log-transformed amount
        
        # Time-based features
        created_at = datetime.fromisoformat(transaction.get('createdAt', datetime.utcnow().isoformat()))
        features.append(created_at.hour)  # Hour of day
        features.append(created_at.weekday())  # Day of week
        features.append(created_at.day)  # Day of month
        
        # Transaction type encoding
        tx_type = transaction.get('transactionType', 'unknown')
        tx_type_map = {
            'registration': 1,
            'transfer': 2,
            'subdivision': 3,
            'consolidation': 4,
            'mortgage': 5,
            'lease': 6
        }
        features.append(tx_type_map.get(tx_type, 0))
        
        # User behavior features
        from_user_id = transaction.get('fromUserId', 0)
        to_user_id = transaction.get('toUserId', 0)
        features.append(from_user_id)
        features.append(to_user_id)
        features.append(1 if from_user_id == to_user_id else 0)  # Self-transaction flag
        
        # Parcel features
        parcel_id = transaction.get('parcelId', 0)
        features.append(parcel_id)
        
        # Payment method features
        payment_method = transaction.get('paymentMethod', 'unknown')
        payment_map = {
            'bank_transfer': 1,
            'cash': 2,
            'check': 3,
            'mobile_money': 4,
            'card': 5
        }
        features.append(payment_map.get(payment_method, 0))
        
        # Status features
        status = transaction.get('status', 'unknown')
        status_map = {
            'initiated': 1,
            'pending': 2,
            'approved': 3,
            'completed': 4,
            'failed': 5,
            'cancelled': 6
        }
        features.append(status_map.get(status, 0))
        
        # Metadata features
        metadata = transaction.get('metadata', {})
        features.append(len(str(metadata)))  # Metadata complexity
        
        return np.array(features)
    
    def train_model(
        self, 
        transactions: List[Dict], 
        labels: Optional[List[int]] = None,
        contamination: float = 0.1
    ):
        """
        Train fraud detection model
        
        Args:
            transactions: List of transaction dictionaries
            labels: Optional labels (1=fraud, 0=legitimate). If None, uses unsupervised learning.
            contamination: Expected proportion of outliers (for unsupervised)
        """
        logger.info(f"Training model on {len(transactions)} transactions...")
        
        # Extract features
        X = np.array([self.extract_features(tx) for tx in transactions])
        
        # Store feature names for reference
        self.feature_names = [
            'amount', 'log_amount', 'hour', 'weekday', 'day',
            'tx_type', 'from_user', 'to_user', 'self_tx',
            'parcel_id', 'payment_method', 'status', 'metadata_length'
        ]
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        if labels is not None:
            # Supervised learning with RandomForest
            logger.info("Training supervised model (RandomForestClassifier)...")
            y = np.array(labels)
            
            X_train, X_test, y_train, y_test = train_test_split(
                X_scaled, y, test_size=0.2, random_state=42, stratify=y
            )
            
            self.model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            )
            
            self.model.fit(X_train, y_train)
            
            # Evaluate
            y_pred = self.model.predict(X_test)
            logger.info("\nModel Performance:")
            logger.info(classification_report(y_test, y_pred))
            logger.info("\nConfusion Matrix:")
            logger.info(confusion_matrix(y_test, y_pred))
            
            # Feature importance
            importances = self.model.feature_importances_
            feature_importance = sorted(
                zip(self.feature_names, importances),
                key=lambda x: x[1],
                reverse=True
            )
            logger.info("\nTop 5 Important Features:")
            for feat, imp in feature_importance[:5]:
                logger.info(f"  {feat}: {imp:.4f}")
        
        else:
            # Unsupervised learning with Isolation Forest
            logger.info("Training unsupervised model (IsolationForest)...")
            self.model = IsolationForest(
                contamination=contamination,
                random_state=42,
                n_estimators=100
            )
            
            self.model.fit(X_scaled)
            
            # Predict on training data for evaluation
            predictions = self.model.predict(X_scaled)
            anomalies = np.sum(predictions == -1)
            logger.info(f"Detected {anomalies} anomalies ({anomalies/len(predictions)*100:.2f}%)")
        
        logger.info("Model training complete")
    
    def predict(self, transaction: Dict) -> Dict:
        """
        Predict if transaction is fraudulent
        
        Args:
            transaction: Transaction dictionary
            
        Returns:
            Dictionary with prediction and confidence
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train_model() first.")
        
        # Extract features
        features = self.extract_features(transaction).reshape(1, -1)
        features_scaled = self.scaler.transform(features)
        
        # Predict
        if isinstance(self.model, RandomForestClassifier):
            # Supervised model
            prediction = self.model.predict(features_scaled)[0]
            probabilities = self.model.predict_proba(features_scaled)[0]
            confidence = probabilities[prediction]
            
            return {
                'is_fraud': bool(prediction == 1),
                'fraud_probability': float(probabilities[1]),
                'confidence': float(confidence),
                'risk_score': float(probabilities[1] * 100),
                'model_type': 'supervised'
            }
        else:
            # Unsupervised model (Isolation Forest)
            prediction = self.model.predict(features_scaled)[0]
            anomaly_score = self.model.score_samples(features_scaled)[0]
            
            # Convert to probability-like score
            risk_score = max(0, min(100, (1 - anomaly_score) * 50))
            
            return {
                'is_fraud': bool(prediction == -1),
                'anomaly_score': float(anomaly_score),
                'risk_score': float(risk_score),
                'confidence': float(abs(anomaly_score)),
                'model_type': 'unsupervised'
            }
    
    def batch_predict(self, transactions: List[Dict]) -> List[Dict]:
        """
        Predict fraud for multiple transactions
        
        Args:
            transactions: List of transaction dictionaries
            
        Returns:
            List of prediction dictionaries
        """
        return [self.predict(tx) for tx in transactions]
    
    def analyze_patterns(self, transactions: List[Dict]) -> Dict:
        """
        Analyze fraud patterns in transaction data
        
        Args:
            transactions: List of transaction dictionaries
            
        Returns:
            Dictionary with pattern analysis
        """
        if not transactions:
            return {'error': 'No transactions provided'}
        
        predictions = self.batch_predict(transactions)
        
        fraud_count = sum(1 for p in predictions if p['is_fraud'])
        fraud_rate = fraud_count / len(transactions) * 100
        
        # Analyze by transaction type
        type_analysis = {}
        for tx, pred in zip(transactions, predictions):
            tx_type = tx.get('transactionType', 'unknown')
            if tx_type not in type_analysis:
                type_analysis[tx_type] = {'total': 0, 'fraud': 0}
            type_analysis[tx_type]['total'] += 1
            if pred['is_fraud']:
                type_analysis[tx_type]['fraud'] += 1
        
        # Calculate fraud rate by type
        for tx_type in type_analysis:
            total = type_analysis[tx_type]['total']
            fraud = type_analysis[tx_type]['fraud']
            type_analysis[tx_type]['fraud_rate'] = round(fraud / total * 100, 2) if total > 0 else 0
        
        # Analyze by amount range
        amount_ranges = {
            'low': (0, 1000000),  # < 1M
            'medium': (1000000, 10000000),  # 1M-10M
            'high': (10000000, float('inf'))  # > 10M
        }
        
        amount_analysis = {k: {'total': 0, 'fraud': 0} for k in amount_ranges}
        
        for tx, pred in zip(transactions, predictions):
            amount = tx.get('amount', 0)
            for range_name, (min_amt, max_amt) in amount_ranges.items():
                if min_amt <= amount < max_amt:
                    amount_analysis[range_name]['total'] += 1
                    if pred['is_fraud']:
                        amount_analysis[range_name]['fraud'] += 1
                    break
        
        # Calculate fraud rate by amount range
        for range_name in amount_analysis:
            total = amount_analysis[range_name]['total']
            fraud = amount_analysis[range_name]['fraud']
            amount_analysis[range_name]['fraud_rate'] = round(fraud / total * 100, 2) if total > 0 else 0
        
        # High-risk transactions
        high_risk = sorted(
            [(tx, pred) for tx, pred in zip(transactions, predictions) if pred['risk_score'] > 70],
            key=lambda x: x[1]['risk_score'],
            reverse=True
        )[:10]  # Top 10 high-risk
        
        return {
            'total_transactions': len(transactions),
            'fraud_detected': fraud_count,
            'fraud_rate': round(fraud_rate, 2),
            'by_transaction_type': type_analysis,
            'by_amount_range': amount_analysis,
            'high_risk_transactions': [
                {
                    'transaction_id': tx.get('transactionId', 'unknown'),
                    'amount': tx.get('amount', 0),
                    'type': tx.get('transactionType', 'unknown'),
                    'risk_score': pred['risk_score'],
                    'is_fraud': pred['is_fraud']
                }
                for tx, pred in high_risk
            ],
            'analyzed_at': datetime.utcnow().isoformat()
        }
    
    def save_model(self, path: Optional[str] = None):
        """Save trained model to disk"""
        save_path = path or self.model_path
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
            'feature_names': self.feature_names
        }
        
        with open(save_path, 'wb') as f:
            pickle.dump(model_data, f)
        
        logger.info(f"Model saved to {save_path}")
    
    def load_model(self, path: str):
        """Load trained model from disk"""
        with open(path, 'rb') as f:
            model_data = pickle.load(f)
        
        self.model = model_data['model']
        self.scaler = model_data['scaler']
        self.feature_names = model_data['feature_names']
        
        logger.info(f"Model loaded from {path}")


def main():
    """Example usage"""
    fraud_detector = FraudDetectionService()
    
    # Example: Generate synthetic training data
    np.random.seed(42)
    transactions = []
    labels = []
    
    # Generate legitimate transactions
    for i in range(900):
        tx = {
            'transactionId': f'TX-{i:04d}',
            'amount': np.random.randint(100000, 5000000),
            'transactionType': np.random.choice(['registration', 'transfer', 'mortgage']),
            'fromUserId': np.random.randint(1, 100),
            'toUserId': np.random.randint(1, 100),
            'parcelId': np.random.randint(1, 500),
            'paymentMethod': np.random.choice(['bank_transfer', 'mobile_money']),
            'status': 'completed',
            'createdAt': datetime.utcnow().isoformat(),
            'metadata': {}
        }
        transactions.append(tx)
        labels.append(0)  # Legitimate
    
    # Generate fraudulent transactions
    for i in range(100):
        tx = {
            'transactionId': f'TX-FRAUD-{i:04d}',
            'amount': np.random.randint(10000000, 50000000),  # Unusually high
            'transactionType': 'transfer',
            'fromUserId': np.random.randint(1, 10),
            'toUserId': np.random.randint(1, 10),  # Often same as from
            'parcelId': np.random.randint(1, 50),
            'paymentMethod': 'cash',  # Suspicious for large amounts
            'status': 'completed',
            'createdAt': datetime.utcnow().replace(hour=2).isoformat(),  # Unusual hour
            'metadata': {}
        }
        transactions.append(tx)
        labels.append(1)  # Fraud
    
    # Train model
    fraud_detector.train_model(transactions, labels)
    
    # Test prediction
    test_tx = {
        'transactionId': 'TX-TEST-001',
        'amount': 25000000,
        'transactionType': 'transfer',
        'fromUserId': 5,
        'toUserId': 5,
        'parcelId': 10,
        'paymentMethod': 'cash',
        'status': 'completed',
        'createdAt': datetime.utcnow().replace(hour=3).isoformat(),
        'metadata': {}
    }
    
    result = fraud_detector.predict(test_tx)
    print("\nPrediction for test transaction:")
    print(json.dumps(result, indent=2))
    
    # Analyze patterns
    analysis = fraud_detector.analyze_patterns(transactions)
    print("\nFraud Pattern Analysis:")
    print(json.dumps(analysis, indent=2))
    
    # Save model
    fraud_detector.save_model()


if __name__ == '__main__':
    main()
