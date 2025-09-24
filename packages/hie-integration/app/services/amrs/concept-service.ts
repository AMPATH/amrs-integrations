import { DatabaseManager } from "../../config/database";
import { logger } from "../../utils/logger";

export interface ConceptMapping {
    conceptUuid: string;
    conceptName: string;
    conceptClass: string;
    mappingType: 'drug' | 'clinical-note' | 'other';
    shrCode?: string;
    shrSystem?: string;
}

export class ConceptService {
    private dbManager: DatabaseManager;
    private conceptCache: Map<string, ConceptMapping> = new Map();
    private cacheTimestamp: number = 0;
    private CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    constructor() {
        this.dbManager = DatabaseManager.getInstance();
    }

    async initializeConceptCache(): Promise<void> {
        try {
            logger.info("Initializing concept mapping cache from database");
            
            const amrsDataSource = this.dbManager.getDataSource("amrs");
            
            // Query to get drug concepts and clinical note concepts
            const query = `
                SELECT 
                    c.uuid as conceptUuid,
                    c.name as conceptName,
                    cc.name as conceptClass,
                    CASE 
                        WHEN cc.name = 'Drug' THEN 'drug'
                        WHEN c.uuid IN (
                            -- Add your clinical note concept UUIDs here
                            '7c4a06ce-11eb-496f-b4db-516ab8d78aa8',
                            'another-clinical-note-concept-uuid'
                        ) THEN 'clinical-note'
                        ELSE 'other'
                    END as mappingType
                FROM concept c
                INNER JOIN concept_class cc ON c.class_id = cc.concept_class_id
                WHERE c.retired = 0
                AND (cc.name = 'Drug' OR c.uuid IN (
                    '7c4a06ce-11eb-496f-b4db-516ab8d78aa8',
                    'another-clinical-note-concept-uuid'
                ))
            `;

            const results = await amrsDataSource.query(query);
            
            this.conceptCache.clear();
            results.forEach((row: any) => {
                this.conceptCache.set(row.conceptUuid, {
                    conceptUuid: row.conceptUuid,
                    conceptName: row.conceptName,
                    conceptClass: row.conceptClass,
                    mappingType: row.mappingType
                });
            });
            
            this.cacheTimestamp = Date.now();
            logger.info(`Loaded ${this.conceptCache.size} concepts into cache`);
            
        } catch (error: any) {
            logger.error({ error }, "Failed to initialize concept cache");
            throw new Error(`ConceptService initialization failed: ${error.message}`);
        }
    }

    private isCacheValid(): boolean {
        return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
    }

    async getConceptMapping(conceptUuid: string): Promise<ConceptMapping | null> {
        // Refresh cache if expired
        if (!this.isCacheValid()) {
            await this.initializeConceptCache();
        }
        
        return this.conceptCache.get(conceptUuid) || null;
    }

    async isDrugConcept(conceptUuid: string): Promise<boolean> {
        const mapping = await this.getConceptMapping(conceptUuid);
        return mapping?.mappingType === 'drug';
    }

    async isClinicalNoteConcept(conceptUuid: string): Promise<boolean> {
        const mapping = await this.getConceptMapping(conceptUuid);
        return mapping?.mappingType === 'clinical-note';
    }

    async getObservationType(observation: any): Promise<'drug' | 'clinical-note' | 'regular'> {
        const coding = observation.code?.coding || [];
        
        for (const code of coding) {
            if (code.code) {
                const mapping = await this.getConceptMapping(code.code);
                if (mapping?.mappingType === 'drug') return 'drug';
                if (mapping?.mappingType === 'clinical-note') return 'clinical-note';
            }
        }
        
        return 'regular';
    }
}