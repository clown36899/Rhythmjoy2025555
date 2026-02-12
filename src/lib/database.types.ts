export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: number
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      billboard_settings: {
        Row: {
          auto_open_on_load: boolean | null
          auto_slide_interval: number | null
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          default_thumbnail_class: string | null
          default_thumbnail_event: string | null
          default_thumbnail_url: string | null
          effect_speed: number | null
          effect_type: string | null
          enabled: boolean | null
          excluded_event_ids: number[] | null
          excluded_weekdays: number[] | null
          id: number
          inactivity_timeout: number | null
          play_order: string | null
          show_date_range: boolean | null
          transition_duration: number | null
          updated_at: string | null
        }
        Insert: {
          auto_open_on_load?: boolean | null
          auto_slide_interval?: number | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          default_thumbnail_class?: string | null
          default_thumbnail_event?: string | null
          default_thumbnail_url?: string | null
          effect_speed?: number | null
          effect_type?: string | null
          enabled?: boolean | null
          excluded_event_ids?: number[] | null
          excluded_weekdays?: number[] | null
          id?: number
          inactivity_timeout?: number | null
          play_order?: string | null
          show_date_range?: boolean | null
          transition_duration?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_open_on_load?: boolean | null
          auto_slide_interval?: number | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          default_thumbnail_class?: string | null
          default_thumbnail_event?: string | null
          default_thumbnail_url?: string | null
          effect_speed?: number | null
          effect_type?: string | null
          enabled?: boolean | null
          excluded_event_ids?: number[] | null
          excluded_weekdays?: number[] | null
          id?: number
          inactivity_timeout?: number | null
          play_order?: string | null
          show_date_range?: boolean | null
          transition_duration?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      billboard_user_settings: {
        Row: {
          auto_slide_interval: number | null
          auto_slide_interval_video: number | null
          billboard_user_id: string
          created_at: string | null
          date_filter_end: string | null
          date_filter_start: string | null
          effect_speed: number | null
          effect_type: string | null
          excluded_event_ids: number[] | null
          excluded_weekdays: number[] | null
          id: number
          play_order: string | null
          transition_duration: number | null
          updated_at: string | null
          video_play_duration: number | null
        }
        Insert: {
          auto_slide_interval?: number | null
          auto_slide_interval_video?: number | null
          billboard_user_id: string
          created_at?: string | null
          date_filter_end?: string | null
          date_filter_start?: string | null
          effect_speed?: number | null
          effect_type?: string | null
          excluded_event_ids?: number[] | null
          excluded_weekdays?: number[] | null
          id?: number
          play_order?: string | null
          transition_duration?: number | null
          updated_at?: string | null
          video_play_duration?: number | null
        }
        Update: {
          auto_slide_interval?: number | null
          auto_slide_interval_video?: number | null
          billboard_user_id?: string
          created_at?: string | null
          date_filter_end?: string | null
          date_filter_start?: string | null
          effect_speed?: number | null
          effect_type?: string | null
          excluded_event_ids?: number[] | null
          excluded_weekdays?: number[] | null
          id?: number
          play_order?: string | null
          transition_duration?: number | null
          updated_at?: string | null
          video_play_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billboard_user_settings_billboard_user_id_fkey"
            columns: ["billboard_user_id"]
            isOneToOne: true
            referencedRelation: "billboard_users"
            referencedColumns: ["id"]
          },
        ]
      }
      billboard_users: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          password_hash: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          password_hash: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          password_hash?: string
        }
        Relationships: []
      }
      board_admins: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      board_anonymous_comment_dislikes: {
        Row: {
          comment_id: number
          created_at: string
          fingerprint: string
          id: number
        }
        Insert: {
          comment_id: number
          created_at?: string
          fingerprint: string
          id?: number
        }
        Update: {
          comment_id?: number
          created_at?: string
          fingerprint?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_anonymous_comment_dislikes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "board_anonymous_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      board_anonymous_comment_likes: {
        Row: {
          comment_id: number
          created_at: string
          fingerprint: string
          id: number
        }
        Insert: {
          comment_id: number
          created_at?: string
          fingerprint: string
          id?: number
        }
        Update: {
          comment_id?: number
          created_at?: string
          fingerprint?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_anonymous_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "board_anonymous_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      board_anonymous_comments: {
        Row: {
          author_name: string
          content: string
          created_at: string
          dislikes: number | null
          id: number
          likes: number | null
          password: string
          post_id: number
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          dislikes?: number | null
          id?: number
          likes?: number | null
          password: string
          post_id: number
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          dislikes?: number | null
          id?: number
          likes?: number | null
          password?: string
          post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_anonymous_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_anonymous_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_anonymous_dislikes: {
        Row: {
          created_at: string
          fingerprint: string | null
          id: number
          post_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          post_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          post_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_anonymous_dislikes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_anonymous_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_anonymous_likes: {
        Row: {
          created_at: string
          fingerprint: string | null
          id: number
          post_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          post_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          post_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_anonymous_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_anonymous_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_anonymous_posts: {
        Row: {
          author_name: string
          author_nickname: string | null
          comment_count: number | null
          content: string
          created_at: string
          dislikes: number | null
          display_order: number | null
          id: number
          image: string | null
          image_thumbnail: string | null
          is_hidden: boolean | null
          is_notice: boolean | null
          likes: number | null
          password: string
          title: string
          updated_at: string
          views: number | null
        }
        Insert: {
          author_name: string
          author_nickname?: string | null
          comment_count?: number | null
          content: string
          created_at?: string
          dislikes?: number | null
          display_order?: number | null
          id?: number
          image?: string | null
          image_thumbnail?: string | null
          is_hidden?: boolean | null
          is_notice?: boolean | null
          likes?: number | null
          password: string
          title: string
          updated_at?: string
          views?: number | null
        }
        Update: {
          author_name?: string
          author_nickname?: string | null
          comment_count?: number | null
          content?: string
          created_at?: string
          dislikes?: number | null
          display_order?: number | null
          id?: number
          image?: string | null
          image_thumbnail?: string | null
          is_hidden?: boolean | null
          is_notice?: boolean | null
          likes?: number | null
          password?: string
          title?: string
          updated_at?: string
          views?: number | null
        }
        Relationships: []
      }
      board_banned_words: {
        Row: {
          created_at: string
          id: number
          word: string
        }
        Insert: {
          created_at?: string
          id?: number
          word: string
        }
        Update: {
          created_at?: string
          id?: number
          word?: string
        }
        Relationships: []
      }
      board_categories: {
        Row: {
          code: string
          display_order: number | null
          is_active: boolean | null
          name: string
        }
        Insert: {
          code: string
          display_order?: number | null
          is_active?: boolean | null
          name: string
        }
        Update: {
          code?: string
          display_order?: number | null
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      board_comment_dislikes: {
        Row: {
          comment_id: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: number
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_comment_dislikes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "board_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      board_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: number
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "board_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      board_comments: {
        Row: {
          author_name: string
          author_nickname: string | null
          content: string
          created_at: string | null
          dislikes: number | null
          id: string
          likes: number | null
          password: string | null
          post_id: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          author_name: string
          author_nickname?: string | null
          content: string
          created_at?: string | null
          dislikes?: number | null
          id?: string
          likes?: number | null
          password?: string | null
          post_id: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          author_name?: string
          author_nickname?: string | null
          content?: string
          created_at?: string | null
          dislikes?: number | null
          id?: string
          likes?: number | null
          password?: string | null
          post_id?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_board_comments_post"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_post_dislikes: {
        Row: {
          created_at: string
          fingerprint: string | null
          id: number
          post_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          post_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          post_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_post_dislikes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_post_favorites: {
        Row: {
          created_at: string
          id: number
          post_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          post_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          post_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_post_favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_post_likes: {
        Row: {
          created_at: string
          id: number
          post_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          post_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          post_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_posts: {
        Row: {
          author_name: string
          author_nickname: string | null
          category: string | null
          comment_count: number | null
          content: string
          created_at: string | null
          dislikes: number | null
          display_order: number | null
          favorites: number | null
          id: number
          image: string | null
          image_thumbnail: string | null
          is_hidden: boolean | null
          is_notice: boolean
          likes: number | null
          prefix_id: number | null
          title: string
          updated_at: string | null
          user_id: string | null
          views: number | null
        }
        Insert: {
          author_name: string
          author_nickname?: string | null
          category?: string | null
          comment_count?: number | null
          content: string
          created_at?: string | null
          dislikes?: number | null
          display_order?: number | null
          favorites?: number | null
          id?: number
          image?: string | null
          image_thumbnail?: string | null
          is_hidden?: boolean | null
          is_notice?: boolean
          likes?: number | null
          prefix_id?: number | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          views?: number | null
        }
        Update: {
          author_name?: string
          author_nickname?: string | null
          category?: string | null
          comment_count?: number | null
          content?: string
          created_at?: string | null
          dislikes?: number | null
          display_order?: number | null
          favorites?: number | null
          id?: number
          image?: string | null
          image_thumbnail?: string | null
          is_hidden?: boolean | null
          is_notice?: boolean
          likes?: number | null
          prefix_id?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_posts_prefix_id_fkey"
            columns: ["prefix_id"]
            isOneToOne: false
            referencedRelation: "board_prefixes"
            referencedColumns: ["id"]
          },
        ]
      }
      board_prefixes: {
        Row: {
          admin_only: boolean | null
          board_category_code: string | null
          color: string | null
          created_at: string | null
          display_order: number | null
          id: number
          name: string
        }
        Insert: {
          admin_only?: boolean | null
          board_category_code?: string | null
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: number
          name: string
        }
        Update: {
          admin_only?: boolean | null
          board_category_code?: string | null
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_prefixes_board_category_code_fkey1"
            columns: ["board_category_code"]
            isOneToOne: false
            referencedRelation: "board_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      board_prefixes_backup: {
        Row: {
          admin_only: boolean | null
          board_category_code: string | null
          color: string
          created_at: string | null
          display_order: number | null
          id: number
          name: string
        }
        Insert: {
          admin_only?: boolean | null
          board_category_code?: string | null
          color?: string
          created_at?: string | null
          display_order?: number | null
          id?: number
          name: string
        }
        Update: {
          admin_only?: boolean | null
          board_category_code?: string | null
          color?: string
          created_at?: string | null
          display_order?: number | null
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_prefixes_board_category_code_fkey"
            columns: ["board_category_code"]
            isOneToOne: false
            referencedRelation: "board_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      board_users: {
        Row: {
          age_range: string | null
          created_at: string | null
          gender: string | null
          id: number
          kakao_id: string | null
          nickname: string
          profile_image: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_range?: string | null
          created_at?: string | null
          gender?: string | null
          id?: number
          kakao_id?: string | null
          nickname: string
          profile_image?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_range?: string | null
          created_at?: string | null
          gender?: string | null
          id?: number
          kakao_id?: string | null
          nickname?: string
          profile_image?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      crawl_history: {
        Row: {
          id: number
          items_found: number | null
          last_crawled_at: string
          url: string
        }
        Insert: {
          id?: number
          items_found?: number | null
          last_crawled_at?: string
          url: string
        }
        Update: {
          id?: number
          items_found?: number | null
          last_crawled_at?: string
          url?: string
        }
        Relationships: []
      }
      crawling_events: {
        Row: {
          author: string | null
          content: string | null
          created_at: string
          date: string | null
          id: number
          sourceUrl: string
          title: string
        }
        Insert: {
          author?: string | null
          content?: string | null
          created_at?: string
          date?: string | null
          id?: number
          sourceUrl: string
          title: string
        }
        Update: {
          author?: string | null
          content?: string | null
          created_at?: string
          date?: string | null
          id?: number
          sourceUrl?: string
          title?: string
        }
        Relationships: []
      }
      deployments: {
        Row: {
          build_id: string
          deployed_at: string | null
          id: number
        }
        Insert: {
          build_id: string
          deployed_at?: string | null
          id?: number
        }
        Update: {
          build_id?: string
          deployed_at?: string | null
          id?: number
        }
        Relationships: []
      }
      event_favorites: {
        Row: {
          created_at: string
          event_id: number
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_favorites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          category: string
          contact: string | null
          created_at: string | null
          date: string
          description: string
          end_date: string | null
          event_dates: Json | null
          genre: string | null
          id: number
          image: string | null
          image_file: string | null
          image_full: string | null
          image_medium: string | null
          image_micro: string | null
          image_position_x: number | null
          image_position_y: number | null
          image_thumbnail: string | null
          link_name1: string | null
          link_name2: string | null
          link_name3: string | null
          link1: string | null
          link2: string | null
          link3: string | null
          location: string
          location_link: string | null
          organizer: string | null
          organizer_name: string | null
          organizer_phone: string | null
          password: string | null
          price: string | null
          registered: number | null
          show_title_on_billboard: boolean | null
          start_date: string | null
          storage_path: string | null
          time: string | null
          title: string
          updated_at: string | null
          user_id: string | null
          venue_custom_link: string | null
          venue_id: string | null
          venue_name: string | null
          video_url: string | null
        }
        Insert: {
          capacity?: number | null
          category: string
          contact?: string | null
          created_at?: string | null
          date: string
          description: string
          end_date?: string | null
          event_dates?: Json | null
          genre?: string | null
          id?: number
          image?: string | null
          image_file?: string | null
          image_full?: string | null
          image_medium?: string | null
          image_micro?: string | null
          image_position_x?: number | null
          image_position_y?: number | null
          image_thumbnail?: string | null
          link_name1?: string | null
          link_name2?: string | null
          link_name3?: string | null
          link1?: string | null
          link2?: string | null
          link3?: string | null
          location: string
          location_link?: string | null
          organizer?: string | null
          organizer_name?: string | null
          organizer_phone?: string | null
          password?: string | null
          price?: string | null
          registered?: number | null
          show_title_on_billboard?: boolean | null
          start_date?: string | null
          storage_path?: string | null
          time?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          venue_custom_link?: string | null
          venue_id?: string | null
          venue_name?: string | null
          video_url?: string | null
        }
        Update: {
          capacity?: number | null
          category?: string
          contact?: string | null
          created_at?: string | null
          date?: string
          description?: string
          end_date?: string | null
          event_dates?: Json | null
          genre?: string | null
          id?: number
          image?: string | null
          image_file?: string | null
          image_full?: string | null
          image_medium?: string | null
          image_micro?: string | null
          image_position_x?: number | null
          image_position_y?: number | null
          image_thumbnail?: string | null
          link_name1?: string | null
          link_name2?: string | null
          link_name3?: string | null
          link1?: string | null
          link2?: string | null
          link3?: string | null
          location?: string
          location_link?: string | null
          organizer?: string | null
          organizer_name?: string | null
          organizer_phone?: string | null
          password?: string | null
          price?: string | null
          registered?: number | null
          show_title_on_billboard?: boolean | null
          start_date?: string | null
          storage_path?: string | null
          time?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          venue_custom_link?: string | null
          venue_id?: string | null
          venue_name?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_events_author"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "board_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      featured_items: {
        Row: {
          created_at: string | null
          id: number
          item_image_url: string
          item_link: string
          item_name: string
          item_price: number | null
          shop_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          item_image_url: string
          item_link: string
          item_name: string
          item_price?: number | null
          shop_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          item_image_url?: string
          item_link?: string
          item_name?: string
          item_price?: number | null
          shop_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "featured_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      global_notices: {
        Row: {
          content: string
          created_at: string
          display_order: number | null
          id: number
          image_url: string | null
          is_active: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          display_order?: number | null
          id?: number
          image_url?: string | null
          is_active?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          display_order?: number | null
          id?: number
          image_url?: string | null
          is_active?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      history_edges: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: number
          label: string | null
          relation_type: string | null
          source_id: number
          target_id: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          label?: string | null
          relation_type?: string | null
          source_id: number
          target_id: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          label?: string | null
          relation_type?: string | null
          source_id?: number
          target_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "history_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "history_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "history_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      history_nodes: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          description: string | null
          id: number
          position_x: number | null
          position_y: number | null
          tags: string[] | null
          title: string
          updated_at: string | null
          year: number | null
          youtube_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          id?: number
          position_x?: number | null
          position_y?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          year?: number | null
          youtube_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          id?: number
          position_x?: number | null
          position_y?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          year?: number | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          token: string
          used: boolean | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          token: string
          used?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          token?: string
          used?: boolean | null
        }
        Relationships: []
      }
      practice_room_favorites: {
        Row: {
          created_at: string | null
          id: number
          practice_room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          practice_room_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          practice_room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_room_favorites_practice_room_id_fkey"
            columns: ["practice_room_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_rooms: {
        Row: {
          additional_link: string | null
          additional_link_title: string | null
          address: string | null
          address_link: string | null
          attachment_link: string | null
          available_hours: string
          capacity: number
          contact: string
          created_at: string
          description: string
          equipment: string
          id: number
          image: string
          image_url: string | null
          images: string | null
          location: string
          name: string
          naver_map_link: string | null
          password: string | null
          price_per_hour: string
        }
        Insert: {
          additional_link?: string | null
          additional_link_title?: string | null
          address?: string | null
          address_link?: string | null
          attachment_link?: string | null
          available_hours: string
          capacity: number
          contact: string
          created_at?: string
          description: string
          equipment: string
          id?: number
          image: string
          image_url?: string | null
          images?: string | null
          location: string
          name: string
          naver_map_link?: string | null
          password?: string | null
          price_per_hour: string
        }
        Update: {
          additional_link?: string | null
          additional_link_title?: string | null
          address?: string | null
          address_link?: string | null
          attachment_link?: string | null
          available_hours?: string
          capacity?: number
          contact?: string
          created_at?: string
          description?: string
          equipment?: string
          id?: number
          image?: string
          image_url?: string | null
          images?: string | null
          location?: string
          name?: string
          naver_map_link?: string | null
          password?: string | null
          price_per_hour?: string
        }
        Relationships: []
      }
      shop_favorites: {
        Row: {
          created_at: string | null
          id: number
          shop_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          shop_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          shop_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_favorites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          logo_url: string | null
          name: string
          password: string | null
          updated_at: string | null
          user_id: string | null
          website_url: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          logo_url?: string | null
          name: string
          password?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          logo_url?: string | null
          name?: string
          password?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string
        }
        Relationships: []
      }
      social_group_favorites: {
        Row: {
          created_at: string
          group_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_group_favorites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "social_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      social_groups: {
        Row: {
          created_at: string
          description: string | null
          id: number
          image_full: string | null
          image_medium: string | null
          image_micro: string | null
          image_thumbnail: string | null
          image_url: string | null
          name: string
          password: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          image_full?: string | null
          image_medium?: string | null
          image_micro?: string | null
          image_thumbnail?: string | null
          image_url?: string | null
          name: string
          password?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          image_full?: string | null
          image_medium?: string | null
          image_micro?: string | null
          image_thumbnail?: string | null
          image_url?: string | null
          name?: string
          password?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_social_groups_author"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "board_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      social_schedules: {
        Row: {
          address: string | null
          category: string | null
          created_at: string | null
          date: string | null
          day_of_week: number | null
          description: string | null
          end_time: string | null
          group_id: number | null
          id: number
          image_full: string | null
          image_medium: string | null
          image_micro: string | null
          image_thumbnail: string | null
          image_url: string | null
          inquiry_contact: string | null
          link_name: string | null
          link_url: string | null
          password: string | null
          place_id: number | null
          place_name: string | null
          start_time: string | null
          title: string
          updated_at: string | null
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          day_of_week?: number | null
          description?: string | null
          end_time?: string | null
          group_id?: number | null
          id?: number
          image_full?: string | null
          image_medium?: string | null
          image_micro?: string | null
          image_thumbnail?: string | null
          image_url?: string | null
          inquiry_contact?: string | null
          link_name?: string | null
          link_url?: string | null
          password?: string | null
          place_id?: number | null
          place_name?: string | null
          start_time?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          day_of_week?: number | null
          description?: string | null
          end_time?: string | null
          group_id?: number | null
          id?: number
          image_full?: string | null
          image_medium?: string | null
          image_micro?: string | null
          image_thumbnail?: string | null
          image_url?: string | null
          inquiry_contact?: string | null
          link_name?: string | null
          link_url?: string | null
          password?: string | null
          place_id?: number | null
          place_name?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_social_schedules_author"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "board_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "social_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_schedules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      system_keys: {
        Row: {
          encrypted_private_key: string
          id: number
          iv: string
          public_key: string
          salt: string
          updated_at: string
        }
        Insert: {
          encrypted_private_key: string
          id: number
          iv: string
          public_key: string
          salt: string
          updated_at?: string
        }
        Update: {
          encrypted_private_key?: string
          id?: number
          iv?: string
          public_key?: string
          salt?: string
          updated_at?: string
        }
        Relationships: []
      }
      theme_settings: {
        Row: {
          background_color: string | null
          calendar_bg_color: string | null
          created_at: string | null
          event_list_bg_color: string | null
          event_list_outer_bg_color: string | null
          header_bg_color: string | null
          id: number
          page_bg_color: string | null
          updated_at: string | null
        }
        Insert: {
          background_color?: string | null
          calendar_bg_color?: string | null
          created_at?: string | null
          event_list_bg_color?: string | null
          event_list_outer_bg_color?: string | null
          header_bg_color?: string | null
          id?: number
          page_bg_color?: string | null
          updated_at?: string | null
        }
        Update: {
          background_color?: string | null
          calendar_bg_color?: string | null
          created_at?: string | null
          event_list_bg_color?: string | null
          event_list_outer_bg_color?: string | null
          header_bg_color?: string | null
          id?: number
          page_bg_color?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_tokens: {
        Row: {
          encrypted_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          encrypted_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          encrypted_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          category: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          images: Json | null
          is_active: boolean | null
          map_url: string | null
          name: string
          phone: string | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          map_url?: string | null
          name: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          map_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_board_post:
      | {
        Args: {
          p_author_name: string
          p_author_nickname?: string
          p_content: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      | {
        Args: {
          p_author_name: string
          p_author_nickname: string
          p_content: string
          p_is_notice?: boolean
          p_prefix_id?: number
          p_title: string
          p_user_id: string
        }
        Returns: Json
      }
      delete_anonymous_comment_with_password: {
        Args: { p_comment_id: number; p_password: string }
        Returns: boolean
      }
      delete_anonymous_post_with_password: {
        Args: { p_password: string; p_post_id: number }
        Returns: boolean
      }
      delete_post_with_password: {
        Args: { p_password: string; p_post_id: number }
        Returns: boolean
      }
      get_all_board_users: {
        Args: never
        Returns: {
          created_at: string
          gender: string
          id: number
          nickname: string
          phone: string
          real_name: string
          user_id: string
        }[]
      }
      get_board_static_data: { Args: never; Returns: Json }
      get_board_user: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          gender: string
          nickname: string
          phone: string
          real_name: string
        }[]
      }
      get_bootstrap_data: { Args: never; Returns: Json }
      get_my_board_user: { Args: { p_user_id: string }; Returns: Json }
      get_user_admin_status: { Args: never; Returns: boolean }
      get_user_interactions: { Args: { p_user_id: string }; Returns: Json }
      increment_board_post_views: {
        Args: { p_post_id: number }
        Returns: undefined
      }
      is_admin_user: { Args: never; Returns: boolean }
      nuke_policies: { Args: { tbl_name: string }; Returns: undefined }
      register_board_user:
      | {
        Args: {
          p_gender: string
          p_nickname: string
          p_phone: string
          p_real_name: string
          p_user_id: string
        }
        Returns: Json
      }
      | {
        Args: {
          p_gender: string
          p_nickname: string
          p_phone: string
          p_real_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      toggle_anonymous_interaction:
      | {
        Args: { p_fingerprint: string; p_post_id: number; p_type: string }
        Returns: Json
      }
      | {
        Args: { p_post_id: number; p_type: string; p_user_id: string }
        Returns: Json
      }
      toggle_comment_interaction: {
        Args: {
          p_comment_id: string
          p_fingerprint?: string
          p_is_anonymous: boolean
          p_type: string
        }
        Returns: Json
      }
      update_anonymous_comment_with_password: {
        Args: {
          p_author_name: string
          p_comment_id: number
          p_content: string
          p_password: string
        }
        Returns: boolean
      }
      update_anonymous_post_with_password: {
        Args: {
          p_content: string
          p_image?: string
          p_image_thumbnail?: string
          p_nickname: string
          p_password: string
          p_post_id: number
          p_title: string
        }
        Returns: boolean
      }
      update_board_post: {
        Args: {
          p_content: string
          p_is_notice?: boolean
          p_post_id: number
          p_prefix_id?: number
          p_title: string
          p_user_id: string
        }
        Returns: Json
      }
      update_post_with_password: {
        Args: {
          p_author_name: string
          p_content: string
          p_image: string
          p_image_thumbnail: string
          p_password: string
          p_post_id: number
          p_title: string
        }
        Returns: boolean
      }
      update_social_event_with_password: {
        Args: {
          p_description: string
          p_event_date: string
          p_event_id: number
          p_image_url: string
          p_password: string
          p_place_id: number
          p_title: string
        }
        Returns: Json
      }
      update_social_schedule_with_password:
      | {
        Args: {
          p_date: string
          p_day_of_week?: number
          p_description: string
          p_end_time: string
          p_inquiry_contact?: string
          p_link_name?: string
          p_link_url?: string
          p_password: string
          p_schedule_id: number
          p_start_time: string
          p_title: string
        }
        Returns: undefined
      }
      | {
        Args: {
          p_date: string
          p_description: string
          p_end_time: string
          p_password: string
          p_schedule_id: number
          p_start_time: string
          p_title: string
        }
        Returns: Json
      }
      verify_anonymous_post_password: {
        Args: { p_password: string; p_post_id: number }
        Returns: boolean
      }
      verify_post_password: {
        Args: { p_password: string; p_post_id: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
