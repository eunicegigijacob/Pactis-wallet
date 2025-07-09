-- Create wallets table
CREATE TABLE IF NOT EXISTS `wallets` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(255) NOT NULL,
  `balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('active','suspended','closed') NOT NULL DEFAULT 'active',
  `currency` varchar(255) DEFAULT 'USD',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `version` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_wallets_userId` (`userId`),
  KEY `IDX_wallets_status` (`status`),
  KEY `IDX_wallets_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create transactions table
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` varchar(36) NOT NULL,
  `transactionId` varchar(255) NOT NULL,
  `walletId` varchar(36) NOT NULL,
  `targetWalletId` varchar(36) DEFAULT NULL,
  `type` enum('deposit','withdrawal','transfer') NOT NULL,
  `status` enum('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `amount` decimal(15,2) NOT NULL,
  `fee` decimal(15,2) DEFAULT NULL,
  `currency` varchar(255) DEFAULT 'USD',
  `description` text,
  `metadata` json DEFAULT NULL,
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_transactions_transactionId` (`transactionId`),
  KEY `IDX_transactions_walletId_createdAt` (`walletId`, `createdAt`),
  KEY `IDX_transactions_type_status` (`type`, `status`),
  KEY `IDX_transactions_targetWalletId` (`targetWalletId`),
  KEY `IDX_transactions_createdAt` (`createdAt`),
  CONSTRAINT `FK_transactions_walletId` FOREIGN KEY (`walletId`) REFERENCES `wallets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_transactions_targetWalletId` FOREIGN KEY (`targetWalletId`) REFERENCES `wallets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 