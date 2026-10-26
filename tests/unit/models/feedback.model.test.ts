import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Customer } from '../../../src/modules/feedbacks/models/customer.model.js';
import { Feedback } from '../../../src/modules/feedbacks/models/feedback.model.js';

describe('Customer & Feedback Model Schema Validation Tests', () => {
  describe('Customer Model', () => {
    it('should validate a customer with valid fields', async () => {
      const customer = new Customer({
        businessId: new mongoose.Types.ObjectId(),
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+15552345678',
      });

      await expect(customer.validate()).resolves.toBeUndefined();
      expect(customer.name).toBe('Jane Doe');
      expect(customer.email).toBe('jane@example.com');
      expect(customer.lastVisitedAt).toBeDefined();
    });

    it('should fail validation when name is too short', async () => {
      const invalidCustomer = new Customer({
        businessId: new mongoose.Types.ObjectId(),
        name: 'J',
      });

      await expect(invalidCustomer.validate()).rejects.toThrow();
    });

    it('should fail validation when email format is invalid', async () => {
      const invalidCustomer = new Customer({
        businessId: new mongoose.Types.ObjectId(),
        name: 'Jane Doe',
        email: 'not-an-email',
      });

      await expect(invalidCustomer.validate()).rejects.toThrow();
    });
  });

  describe('Feedback Model', () => {
    it('should validate valid feedback with 5-star rating and consent', async () => {
      const feedback = new Feedback({
        businessId: new mongoose.Types.ObjectId(),
        qrCampaignId: new mongoose.Types.ObjectId(),
        customerId: new mongoose.Types.ObjectId(),
        rating: 5,
        text: 'Outstanding atmosphere and friendly staff!',
        answers: [
          {
            questionId: 'overall_experience',
            questionLabel: 'What did you enjoy most?',
            answer: 'The freshly baked pastries.',
          },
        ],
        consentAccepted: true,
      });

      await expect(feedback.validate()).resolves.toBeUndefined();
      expect(feedback.status).toBe('new');
      expect(feedback.rating).toBe(5);
    });

    it('should fail validation when rating is less than 1 or greater than 5', async () => {
      const lowFeedback = new Feedback({
        businessId: new mongoose.Types.ObjectId(),
        qrCampaignId: new mongoose.Types.ObjectId(),
        customerId: new mongoose.Types.ObjectId(),
        rating: 0,
        consentAccepted: true,
      });

      await expect(lowFeedback.validate()).rejects.toThrow();

      const highFeedback = new Feedback({
        businessId: new mongoose.Types.ObjectId(),
        qrCampaignId: new mongoose.Types.ObjectId(),
        customerId: new mongoose.Types.ObjectId(),
        rating: 6,
        consentAccepted: true,
      });

      await expect(highFeedback.validate()).rejects.toThrow();
    });

    it('should fail validation when consentAccepted is false or omitted', async () => {
      const noConsent = new Feedback({
        businessId: new mongoose.Types.ObjectId(),
        qrCampaignId: new mongoose.Types.ObjectId(),
        customerId: new mongoose.Types.ObjectId(),
        rating: 4,
        consentAccepted: false,
      });

      await expect(noConsent.validate()).rejects.toThrow();
    });

    it('should fail validation when text exceeds 2000 characters', async () => {
      const longTextFeedback = new Feedback({
        businessId: new mongoose.Types.ObjectId(),
        qrCampaignId: new mongoose.Types.ObjectId(),
        customerId: new mongoose.Types.ObjectId(),
        rating: 3,
        text: 'A'.repeat(2001),
        consentAccepted: true,
      });

      await expect(longTextFeedback.validate()).rejects.toThrow();
    });
  });
});
