# Spring Boot API. Build with the Gradle wrapper, run the layered boot jar on a
# JRE as a non-root user. Configuration comes entirely from the environment
# (SPRING_PROFILES_ACTIVE=prod and the variables listed in the README).
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
# Dependencies first so source edits do not invalidate the download layer.
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon bootJar -x test \
 && java -Djarmode=tools -jar build/libs/*-SNAPSHOT.jar extract --layers --launcher --destination /extracted

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 --create-home anifire \
 && mkdir -p /app/uploads && chown anifire /app/uploads
WORKDIR /app
COPY --from=build /extracted/dependencies/ ./
COPY --from=build /extracted/spring-boot-loader/ ./
COPY --from=build /extracted/snapshot-dependencies/ ./
COPY --from=build /extracted/application/ ./
USER anifire
ENV SPRING_PROFILES_ACTIVE=prod \
    ANIFIRE_UPLOADS_DIR=/app/uploads \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
VOLUME /app/uploads
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/actuator/health/liveness || exit 1
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
