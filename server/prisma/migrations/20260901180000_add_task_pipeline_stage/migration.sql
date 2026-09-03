-- C2: Task-level pipeline stages (engagement workflow step codes on individual tasks)
ALTER TABLE `Task` ADD COLUMN `pipelineStage` VARCHAR(191) NULL;

CREATE INDEX `Task_pipelineStage_idx` ON `Task`(`pipelineStage`);
