-- =====================================================
-- Migration: Add User Settings Table
-- Version: 001
-- Description: Adds user_settings table for storing user preferences including currency settings
-- Date: 2025-01-18
-- =====================================================

-- Check if migration has already been applied
DO $$
BEGIN
    -- Check if user_settings table already exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_settings') THEN
        
        -- Create user settings table for storing user preferences
        CREATE TABLE user_settings (
            setting_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- Owner of these settings
            
            -- Currency Settings
            currency VARCHAR(3) DEFAULT 'USD' CHECK (currency IN ('USD', 'RWF')), -- User's preferred currency
            
            -- Language & Localization Settings
            language VARCHAR(5) DEFAULT 'en' CHECK (language IN ('en', 'rw')), -- User's preferred language
            timezone VARCHAR(50) DEFAULT 'UTC', -- User's timezone
            date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY', -- Preferred date format
            
            -- Theme & Display Settings
            theme VARCHAR(10) DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')), -- UI theme preference
            
            -- Notification Settings
            email_notifications BOOLEAN DEFAULT TRUE, -- Enable email notifications
            sms_notifications BOOLEAN DEFAULT FALSE, -- Enable SMS notifications
            low_stock_alerts BOOLEAN DEFAULT TRUE, -- Enable low stock alerts
            daily_reports BOOLEAN DEFAULT TRUE, -- Enable daily reports
            weekly_reports BOOLEAN DEFAULT TRUE, -- Enable weekly reports
            monthly_reports BOOLEAN DEFAULT FALSE, -- Enable monthly reports
            auto_reporting BOOLEAN DEFAULT TRUE, -- Enable automatic reporting
            
            -- Business Settings
            business_hours_start TIME DEFAULT '08:00:00', -- Business start time
            business_hours_end TIME DEFAULT '18:00:00', -- Business end time
            working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Working days (1=Monday, 7=Sunday)
            
            -- Audit fields
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Create unique index to ensure one settings record per user
        CREATE UNIQUE INDEX idx_user_settings_user_id ON user_settings(user_id);

        -- Create index for faster lookups
        CREATE INDEX idx_user_settings_currency ON user_settings(currency);
        CREATE INDEX idx_user_settings_language ON user_settings(language);

        -- Create trigger function to update updated_at timestamp
        CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
        RETURNS TRIGGER AS $trigger$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $trigger$ LANGUAGE plpgsql;

        -- Create trigger to update updated_at timestamp
        CREATE TRIGGER trigger_update_user_settings_updated_at
            BEFORE UPDATE ON user_settings
            FOR EACH ROW
            EXECUTE FUNCTION update_user_settings_updated_at();

        -- Add comments for documentation
        COMMENT ON TABLE user_settings IS 'Stores user preferences and application settings';
        COMMENT ON COLUMN user_settings.setting_id IS 'Unique identifier for each setting record';
        COMMENT ON COLUMN user_settings.user_id IS 'User who owns these settings';
        COMMENT ON COLUMN user_settings.currency IS 'User preferred currency (USD or RWF)';
        COMMENT ON COLUMN user_settings.language IS 'User preferred language (en or rw)';
        COMMENT ON COLUMN user_settings.timezone IS 'User timezone for date/time display';
        COMMENT ON COLUMN user_settings.theme IS 'UI theme preference (light, dark, or system)';
        COMMENT ON COLUMN user_settings.email_notifications IS 'Enable/disable email notifications';
        COMMENT ON COLUMN user_settings.sms_notifications IS 'Enable/disable SMS notifications';
        COMMENT ON COLUMN user_settings.low_stock_alerts IS 'Enable/disable low stock alerts';
        COMMENT ON COLUMN user_settings.daily_reports IS 'Enable/disable daily reports';
        COMMENT ON COLUMN user_settings.weekly_reports IS 'Enable/disable weekly reports';
        COMMENT ON COLUMN user_settings.monthly_reports IS 'Enable/disable monthly reports';
        COMMENT ON COLUMN user_settings.auto_reporting IS 'Enable/disable automatic reporting';
        COMMENT ON COLUMN user_settings.business_hours_start IS 'Business operating start time';
        COMMENT ON COLUMN user_settings.business_hours_end IS 'Business operating end time';
        COMMENT ON COLUMN user_settings.working_days IS 'Array of working days (1=Monday, 7=Sunday)';

        -- Create default settings for existing users
        INSERT INTO user_settings (user_id, currency, language, theme)
        SELECT 
            user_id,
            'USD' as currency,
            'en' as language,
            'light' as theme
        FROM users
        WHERE NOT EXISTS (
            SELECT 1 FROM user_settings WHERE user_settings.user_id = users.user_id
        );

        RAISE NOTICE 'Migration 001: user_settings table created successfully';
        
    ELSE
        RAISE NOTICE 'Migration 001: user_settings table already exists, skipping';
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Migration 001 failed: %', SQLERRM;
END $$;

-- Create migrations tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add comment for migrations table
COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations';

-- Record this migration
INSERT INTO schema_migrations (version, description)
VALUES ('001', 'Add user_settings table for user preferences including currency settings')
ON CONFLICT (version) DO NOTHING;

-- =====================================================
-- End of Migration 001
-- =====================================================
