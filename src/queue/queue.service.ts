import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';

@Injectable()
export class QueueService {
  constructor(@InjectQueue('transactions') private transactionsQueue: Queue) {}

  async addJob<T>(queueName: string, jobType: string, data: T, options?: any): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    return await queue.add(jobType, data, options);
  }

  async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.getQueue(queueName);
    return await queue.getJob(jobId);
  }

  async getJobs(queueName: string, status?: string): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    return await queue.getJobs([status || 'active']);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.getQueue(queueName);
    return await queue.getJobCounts();
  }

  private getQueue(queueName: string): Queue {
    switch (queueName) {
      case 'transactions':
        return this.transactionsQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }
} 