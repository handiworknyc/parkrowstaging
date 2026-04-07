<?php
/**
 * Plugin Name: Park Row Astro Sync Fields
 * Description: Exposes selected ACF fields as REST endpoints for the Astro sync job.
 */

if (!defined('PARKROW_ASTRO_SYNC_PAGE_ID')) {
    define('PARKROW_ASTRO_SYNC_PAGE_ID', 42);
}

if (!function_exists('parkrow_astro_sync_normalize_uri')) {
    function parkrow_astro_sync_normalize_uri($url) {
        $path = wp_parse_url((string) $url, PHP_URL_PATH);
        $path = is_string($path) && '' !== $path ? $path : '/';

        if ('/' !== substr($path, 0, 1)) {
            $path = '/' . $path;
        }

        return '/' === $path ? '/' : trailingslashit($path);
    }
}

if (!function_exists('parkrow_astro_sync_resolve_page_id')) {
    function parkrow_astro_sync_resolve_page_id($request) {
        $page_id = absint($request->get_param('page_id'));

        if ($page_id > 0) {
            return $page_id;
        }

        return absint(PARKROW_ASTRO_SYNC_PAGE_ID);
    }
}

if (!function_exists('parkrow_astro_sync_get_page_payload')) {
    function parkrow_astro_sync_get_page_payload($page_id) {
        $post = get_post($page_id);

        if (!$post instanceof WP_Post || 'page' !== $post->post_type) {
            return new WP_Error(
                'parkrow_astro_sync_page_not_found',
                'The requested page could not be found.',
                array('status' => 404)
            );
        }

        $status = get_post_status($post);
        if ('publish' !== $status && !current_user_can('edit_post', $page_id)) {
            return new WP_Error(
                'parkrow_astro_sync_forbidden',
                'The requested page is not publicly available.',
                array('status' => 403)
            );
        }

        return array(
            'kind' => 'page',
            'id' => (int) $post->ID,
            'uri' => parkrow_astro_sync_normalize_uri(get_permalink($post)),
            'title' => html_entity_decode((string) get_the_title($post), ENT_QUOTES, get_bloginfo('charset')),
        );
    }
}

if (!function_exists('parkrow_astro_sync_prepare_image')) {
    function parkrow_astro_sync_prepare_image($image) {
        if (empty($image)) {
            return null;
        }

        if (is_numeric($image)) {
            $attachment_id = absint($image);
            $meta = wp_get_attachment_metadata($attachment_id);

            $image = array(
                'ID' => $attachment_id,
                'url' => wp_get_attachment_url($attachment_id),
                'alt' => get_post_meta($attachment_id, '_wp_attachment_image_alt', true),
                'title' => get_the_title($attachment_id),
                'caption' => wp_get_attachment_caption($attachment_id),
                'description' => get_post_field('post_content', $attachment_id),
                'mime_type' => get_post_mime_type($attachment_id),
                'width' => is_array($meta) && !empty($meta['width']) ? (int) $meta['width'] : 0,
                'height' => is_array($meta) && !empty($meta['height']) ? (int) $meta['height'] : 0,
            );
        } elseif (is_string($image)) {
            $image = array(
                'url' => $image,
            );
        }

        if (!is_array($image)) {
            return null;
        }

        $payload = array(
            'id' => !empty($image['ID']) ? absint($image['ID']) : 0,
            'url' => !empty($image['url']) ? esc_url_raw($image['url']) : '',
            'alt' => isset($image['alt']) ? sanitize_text_field($image['alt']) : '',
            'title' => isset($image['title']) ? sanitize_text_field($image['title']) : '',
            'caption' => isset($image['caption']) ? wp_kses_post($image['caption']) : '',
            'description' => isset($image['description']) ? wp_kses_post($image['description']) : '',
            'mime_type' => !empty($image['mime_type']) ? sanitize_mime_type($image['mime_type']) : '',
            'width' => !empty($image['width']) ? absint($image['width']) : 0,
            'height' => !empty($image['height']) ? absint($image['height']) : 0,
        );

        return array_filter(
            $payload,
            static function ($value) {
                return null !== $value && '' !== $value;
            }
        );
    }
}

if (!function_exists('parkrow_astro_sync_prepare_file')) {
    function parkrow_astro_sync_prepare_file($file) {
        if (empty($file)) {
            return null;
        }

        if (is_numeric($file)) {
            $attachment_id = absint($file);
            $file_path = get_attached_file($attachment_id);
            $mime_type = get_post_mime_type($attachment_id);

            $file = array(
                'ID' => $attachment_id,
                'url' => wp_get_attachment_url($attachment_id),
                'title' => get_the_title($attachment_id),
                'filename' => $file_path ? wp_basename($file_path) : '',
                'mime_type' => $mime_type,
                'subtype' => is_string($mime_type) && false !== strpos($mime_type, '/')
                    ? sanitize_key(substr(strrchr($mime_type, '/'), 1))
                    : '',
                'filesize' => $file_path && file_exists($file_path) ? (int) filesize($file_path) : 0,
            );
        } elseif (is_string($file)) {
            $file = array(
                'url' => $file,
            );
        }

        if (!is_array($file)) {
            return null;
        }

        $payload = array(
            'id' => !empty($file['ID']) ? absint($file['ID']) : 0,
            'url' => !empty($file['url']) ? esc_url_raw($file['url']) : '',
            'title' => isset($file['title']) ? sanitize_text_field($file['title']) : '',
            'filename' => !empty($file['filename']) ? sanitize_file_name($file['filename']) : '',
            'mime_type' => !empty($file['mime_type']) ? sanitize_mime_type($file['mime_type']) : '',
            'subtype' => !empty($file['subtype']) ? sanitize_key($file['subtype']) : '',
            'filesize' => !empty($file['filesize']) ? absint($file['filesize']) : 0,
        );

        return array_filter(
            $payload,
            static function ($value) {
                return null !== $value && '' !== $value;
            }
        );
    }
}

if (!function_exists('parkrow_astro_sync_get_floor_plan_detail')) {
    function parkrow_astro_sync_get_floor_plan_detail($page_id) {
        $rows = get_field('floor_plan_detail', $page_id);
        $items = array();

        if (!is_array($rows)) {
            return $items;
        }

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $exterior = isset($row['exterior']) && (is_string($row['exterior']) || is_numeric($row['exterior']))
                ? sanitize_text_field((string) $row['exterior'])
                : '';

            $items[] = array(
                'unit' => isset($row['unit']) ? sanitize_text_field($row['unit']) : '',
                'exterior' => $exterior,
                'floor_plan_image' => parkrow_astro_sync_prepare_image($row['floor_plan_image'] ?? null),
                'floor_plan_pdf' => parkrow_astro_sync_prepare_file($row['floor_plan_pdf'] ?? null),
            );
        }

        return $items;
    }
}

if (!function_exists('parkrow_astro_sync_get_panoramic_views')) {
    function parkrow_astro_sync_get_panoramic_views($page_id) {
        $rows = get_field('views', $page_id);
        $items = array();

        if (!is_array($rows)) {
            return $items;
        }

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $items[] = array(
                'floors' => isset($row['floors']) ? sanitize_textarea_field($row['floors']) : '',
                'day_view' => parkrow_astro_sync_prepare_image($row['day_view'] ?? null),
                'night_view' => parkrow_astro_sync_prepare_image($row['night_view'] ?? null),
            );
        }

        return $items;
    }
}

if (!function_exists('parkrow_astro_sync_get_floorplan_disclaimer')) {
    function parkrow_astro_sync_get_floorplan_disclaimer($page_id) {
        $value = get_field('floorplan_disclaimer', $page_id);

        if (is_string($value) || is_numeric($value)) {
            return sanitize_textarea_field((string) $value);
        }

        return '';
    }
}

if (!function_exists('parkrow_astro_sync_build_response')) {
    function parkrow_astro_sync_build_response($page_id, $field_name, $value) {
        $payload = parkrow_astro_sync_get_page_payload($page_id);
        if (is_wp_error($payload)) {
            return $payload;
        }

        if (is_array($value) || is_scalar($value)) {
            $payload[$field_name] = $value;
        } elseif (null === $value) {
            $payload[$field_name] = '';
        } else {
            $payload[$field_name] = array();
        }

        $payload['_syncedAt'] = gmdate('Y-m-d H:i:s');

        return new WP_REST_Response($payload, 200);
    }
}

add_action('rest_api_init', function () {
    register_rest_route(
        'astro/v1',
        '/floor-plan-detail',
        array(
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'args' => array(
                'page_id' => array(
                    'description' => 'Optional page ID override. Defaults to PARKROW_ASTRO_SYNC_PAGE_ID.',
                    'sanitize_callback' => 'absint',
                ),
            ),
            'callback' => function ($request) {
                if (!function_exists('get_field')) {
                    return new WP_Error(
                        'parkrow_astro_sync_missing_acf',
                        'Advanced Custom Fields is required for this endpoint.',
                        array('status' => 500)
                    );
                }

                $page_id = parkrow_astro_sync_resolve_page_id($request);

                return parkrow_astro_sync_build_response(
                    $page_id,
                    'floor_plan_detail',
                    parkrow_astro_sync_get_floor_plan_detail($page_id)
                );
            },
        )
    );

    register_rest_route(
        'astro/v1',
        '/panoramic-views',
        array(
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'args' => array(
                'page_id' => array(
                    'description' => 'Optional page ID override. Defaults to PARKROW_ASTRO_SYNC_PAGE_ID.',
                    'sanitize_callback' => 'absint',
                ),
            ),
            'callback' => function ($request) {
                if (!function_exists('get_field')) {
                    return new WP_Error(
                        'parkrow_astro_sync_missing_acf',
                        'Advanced Custom Fields is required for this endpoint.',
                        array('status' => 500)
                    );
                }

                $page_id = parkrow_astro_sync_resolve_page_id($request);

                return parkrow_astro_sync_build_response(
                    $page_id,
                    'views',
                    parkrow_astro_sync_get_panoramic_views($page_id)
                );
            },
        )
    );

    register_rest_route(
        'astro/v1',
        '/floorplan-disclaimer',
        array(
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'args' => array(
                'page_id' => array(
                    'description' => 'Optional page ID override. Defaults to PARKROW_ASTRO_SYNC_PAGE_ID.',
                    'sanitize_callback' => 'absint',
                ),
            ),
            'callback' => function ($request) {
                if (!function_exists('get_field')) {
                    return new WP_Error(
                        'parkrow_astro_sync_missing_acf',
                        'Advanced Custom Fields is required for this endpoint.',
                        array('status' => 500)
                    );
                }

                $page_id = parkrow_astro_sync_resolve_page_id($request);

                return parkrow_astro_sync_build_response(
                    $page_id,
                    'floorplan_disclaimer',
                    parkrow_astro_sync_get_floorplan_disclaimer($page_id)
                );
            },
        )
    );
});
