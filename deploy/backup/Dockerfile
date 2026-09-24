# pg_dump/pg_restore matching the server major (16) plus the MinIO client for
# the off-site copy to any S3-compatible bucket.
FROM quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z AS mc

FROM postgres:16
COPY --from=mc /usr/bin/mc /usr/local/bin/mc
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh
VOLUME /backups
ENTRYPOINT ["backup.sh"]
