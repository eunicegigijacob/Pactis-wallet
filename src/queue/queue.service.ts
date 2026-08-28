import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue, Job, JobStatus } from "bull";

import { TRANSACTION_QUEUE, TRANSACTION_DLQ } from "./queue.constants";

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(TRANSACTION_QUEUE) private transactionsQueue: Queue,
    @InjectQueue(TRANSACTION_DLQ) private deadLetterQueue: Queue
  ) {}

  async addJob<T>(
    queueName: string,
    jobType: string,
    data: T,
    options?: any
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    return await queue.add(jobType, data, options);
  }

  async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.getQueue(queueName);
    return await queue.getJob(jobId);
  }

  async getJobs(queueName: string, status?: JobStatus): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    return await queue.getJobs([status || "active"]);
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
      case TRANSACTION_QUEUE:
        return this.transactionsQueue;
      case TRANSACTION_DLQ:
        return this.deadLetterQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }
}
